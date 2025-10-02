"""
视频生成路由
处理批量图片生成和视频拼接功能
"""

from fastapi import APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel, Field
from typing import Optional, Literal, Dict
from utils.auth_utils import get_current_user_optional, CurrentUser, get_user_from_token
from services.video_generation_service import get_video_generation_service
from services.sora2_service import sora2_service
from services.sora2_share_service import get_sora2_share_service
from log import get_logger
from common import BASE_URL
import asyncio
import json

logger = get_logger(__name__)

router = APIRouter(prefix="/api")


# WebSocket连接管理器
class ConnectionManager:
    """管理WebSocket连接，按用户UUID组织"""

    def __init__(self):
        # {user_uuid: [websocket1, websocket2, ...]}
        self.active_connections: Dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_uuid: str):
        """新连接加入"""
        await websocket.accept()
        if user_uuid not in self.active_connections:
            self.active_connections[user_uuid] = []
        self.active_connections[user_uuid].append(websocket)
        logger.info(f"🔌 WebSocket connected - user: {user_uuid[:8]}..., total: {len(self.active_connections[user_uuid])}")

    def disconnect(self, websocket: WebSocket, user_uuid: str):
        """移除断开的连接"""
        if user_uuid in self.active_connections:
            self.active_connections[user_uuid].remove(websocket)
            if not self.active_connections[user_uuid]:
                del self.active_connections[user_uuid]
        logger.info(f"🔌 WebSocket disconnected - user: {user_uuid[:8]}...")

    async def send_to_user(self, user_uuid: str, message: dict):
        """向指定用户的所有连接发送消息"""
        if user_uuid not in self.active_connections:
            return

        dead_connections = []
        for websocket in self.active_connections[user_uuid]:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning(f"⚠️ Failed to send message to {user_uuid[:8]}...: {e}")
                dead_connections.append(websocket)

        # 清理死连接
        for websocket in dead_connections:
            self.disconnect(websocket, user_uuid)


# 全局连接管理器
ws_manager = ConnectionManager()


# 请求模型
class ImgVideo1Request(BaseModel):
    """图片转视频请求参数"""
    image: str = Field(..., description="输入图片（URL或base64）")
    mode: Literal[
        "up", "down", "left", "right",
        "rotate-left", "rotate-right",
        "zoom-in", "zoom-out",
        "future", "past",
        "funny", "serious",
        "dramatic", "peaceful",
        "futuristic", "nature",
        "urban", "minimalist",
        "crowded", "empty"
    ] = Field(default="funny", description="图片变换模式")
    num_frames: int = Field(default=10, ge=1, le=60, description="生成帧数（1-60）")


# 响应模型
class ImgVideo1Response(BaseModel):
    """图片转视频响应"""
    video_url: str = Field(..., description="生成的视频URL（腾讯云地址）")
    num_frames: int = Field(..., description="实际生成的帧数")
    duration_seconds: float = Field(..., description="视频时长（秒）")
    status: str = Field(default="success", description="处理状态")


# Mode到Prompt的映射
PROMPTS = {
    "up": "Gently pan the camera up, extending the image.",
    "down": "Gently pan the camera down, extending the image.",
    "left": "Gently pan the camera left, extending the image.",
    "right": "Gently pan the camera right, extending the image.",
    "rotate-left": "Gently rotate the camera counter-clockwise, extending the borders to fit the new perspective.",
    "rotate-right": "Gently rotate the camera clockwise, extending the borders to fit the new perspective.",
    "zoom-in": "Gently zoom in on the center of the image, maintaining focus and detail.",
    "zoom-out": "Gently zoom out from the image, revealing more of the surrounding scene.",
    "future": "Show this scene one second in the future",
    "past": "Show this scene one second in the past",
    "funny": "Subtly alter this image by replacing one or two details with something unexpected and funny.",
    "serious": "Subtly alter this image by replacing one or two details with something more serious, meaningful, or thought-provoking.",
    "dramatic": "Subtly enhance the drama and intensity of this scene. Adjust lighting to be more cinematic, deepen shadows, or add atmospheric elements like mist or dramatic sky. Keep changes photorealistic and well-integrated.",
    "peaceful": "Transform this scene to be more peaceful and serene. Soften harsh elements, add calming details like gentle lighting or natural elements. Keep changes subtle and photorealistic.",
    "futuristic": "Subtly modernize or add futuristic elements to this scene. Replace one or two objects with sleek, high-tech alternatives. Keep changes minimal, well-integrated, and photorealistic.",
    "nature": "Subtly introduce natural elements into this scene. Add plants, natural lighting, or organic textures. Keep changes small and seamlessly integrated with photorealistic quality.",
    "urban": "Subtly add urban elements to this scene. Introduce architectural details, city textures, or modern infrastructure. Keep changes minimal and photorealistic.",
    "minimalist": "Simplify this scene with minimalist aesthetics. Remove or tone down one or two distracting elements, create cleaner compositions, and emphasize negative space. Keep it photorealistic.",
    "crowded": "Subtly add more people or objects to make this scene feel more populated or busy. Keep additions natural, well-integrated, and photorealistic.",
    "empty": "Subtly remove one or two people or objects to make this scene feel more spacious or isolated. Keep the result natural and photorealistic.",
}


def get_prompt_for_mode(mode: str) -> str:
    """
    根据mode获取对应的提示词

    Args:
        mode: 图片变换模式

    Returns:
        对应的提示词

    Raises:
        ValueError: 如果mode不存在
    """
    prompt = PROMPTS.get(mode)
    if not prompt:
        raise ValueError(f"Unknown mode: {mode}")
    return prompt


@router.post("/img_video_1", response_model=ImgVideo1Response)
async def generate_img_video(
    request: ImgVideo1Request,
    current_user: Optional[CurrentUser] = Depends(get_current_user_optional)
):
    """
    批量生成nano-banana图片并拼接成视频

    工作流程：
    1. 获取输入图片和模式对应的prompt
    2. 串行生成num_frames帧图片（每帧基于前一帧）
    3. 使用ffmpeg将图片序列拼接成视频
    4. 上传到腾讯云并返回URL
    """
    try:
        logger.info(f"🎬 开始生成视频 - mode: {request.mode}, num_frames: {request.num_frames}")

        # 获取用户信息
        user_email = current_user.email if current_user else None
        user_id = str(current_user.id) if current_user else None
        logger.info(f"👤 用户信息 - email: {user_email}, id: {user_id}")

        # 获取mode对应的prompt
        prompt = get_prompt_for_mode(request.mode)
        logger.info(f"📝 使用提示词: {prompt[:100]}...")

        # 获取视频生成服务
        video_service = get_video_generation_service()

        # 执行视频生成
        # 默认配置：5fps（5张图片=1秒）
        result = await video_service.generate_video(
            initial_image_url=request.image,
            mode=request.mode,
            prompt=prompt,
            num_frames=request.num_frames,
            frame_rate=5,  # 5fps：5张图片=1秒
            user_email=user_email
        )

        if not result:
            raise HTTPException(status_code=500, detail="视频生成失败，请查看日志")

        logger.info(f"✅ 视频生成成功: {result['video_url']}")

        return ImgVideo1Response(
            video_url=result['video_url'],
            num_frames=result['num_frames'],
            duration_seconds=result['duration_seconds'],
            status="success"
        )

    except ValueError as e:
        logger.error(f"❌ 参数错误: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 生成视频失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"生成视频失败: {str(e)}")


# Sora2 视频生成请求模型
class Sora2GenRequest(BaseModel):
    """Sora2视频生成请求参数"""
    prompt: str = Field(..., description="视频生成提示词")
    model: str = Field(default="sora2", description="视频生成模型（sora2, veo3-fast）")
    aspect_ratio: str = Field(default="9:16", description="视频宽高比（1:1, 16:9, 4:3, 21:9, 9:16）")
    duration: int = Field(default=5, ge=3, le=10, description="视频时长（秒，3-10）")
    resolution: str = Field(default="480p", description="视频分辨率")


# Sora2 视频生成响应模型
class Sora2GenResponse(BaseModel):
    """Sora2视频生成响应"""
    task_id: str = Field(..., description="任务ID")
    video_url: Optional[str] = Field(None, description="生成的视频URL")
    status: str = Field(default="processing", description="任务状态：processing/completed/failed")
    message: str = Field(default="视频生成中...", description="状态消息")


# Sora2 任务详情响应模型
class Sora2TaskDetail(BaseModel):
    """Sora2任务详情"""
    id: int = Field(..., description="任务ID")
    user_uuid: str = Field(..., description="用户UUID")
    prompt: str = Field(..., description="视频生成提示词")
    model: str = Field(..., description="使用的模型")
    images: list = Field(default=[], description="参考图片列表")
    video_url: str = Field(default="", description="生成的视频URL")
    status: str = Field(..., description="任务状态：running/success/failed")
    remark: str = Field(default="", description="备注信息")
    ctime: str = Field(..., description="创建时间")
    mtime: str = Field(..., description="最后更新时间")
    views: int = Field(default=0, description="访问量")
    likes: int = Field(default=0, description="点赞量")
    share_id: Optional[str] = Field(None, description="分享ID")
    user_image_url: Optional[str] = Field(None, description="用户头像URL")


# Sora2 任务列表响应模型
class Sora2TaskListResponse(BaseModel):
    """Sora2任务列表响应"""
    tasks: list[Sora2TaskDetail] = Field(..., description="任务列表")
    total: int = Field(..., description="总任务数")
    limit: int = Field(..., description="每页数量")
    offset: int = Field(..., description="偏移量")


@router.post("/sora_2_gen", response_model=Sora2GenResponse)
async def generate_sora2_video(
    request: Sora2GenRequest,
    current_user: Optional[CurrentUser] = Depends(get_current_user_optional)
):
    """
    使用AI模型生成视频（异步模式，立即返回任务ID）

    工作流程：
    1. 接收用户提示词和参数
    2. 创建数据库记录（status=running）
    3. 启动后台异步任务（不等待完成）
    4. 立即返回任务ID
    5. 用户通过任务ID轮询获取状态

    支持的模型：
    - sora2: OpenAI Sora 2 模型
    - veo3-fast: Google Veo3 Fast 模型
    """
    import asyncio

    try:
        logger.info(f"🎬 接收视频生成请求 - model: {request.model}, prompt: {request.prompt[:50]}...")

        # 获取用户信息
        if not current_user:
            raise HTTPException(status_code=401, detail="请先登录")

        user_email = current_user.email
        user_uuid = current_user.uuid
        user_id = current_user.id
        logger.info(f"👤 用户: {user_email}")

        # 检查用户积分是否足够（需要5积分）
        from services.db_service import db_service
        user_info = await db_service.get_user_by_id(user_id)

        if not user_info:
            raise HTTPException(status_code=404, detail="用户不存在")

        current_points = user_info.get('points', 0)
        required_points = 5

        if current_points < required_points:
            logger.warning(f"⚠️ 用户 {user_email} 积分不足: {current_points} < {required_points}")
            # 返回成功响应，但标记为积分不足
            return Sora2GenResponse(
                task_id="",
                status="insufficient_points",
                message=f"积分不足，当前积分: {current_points}，需要: {required_points}"
            )

        logger.info(f"✅ 积分检查通过 - 当前积分: {current_points}")

        # 1. 创建数据库记录（初始状态为 running）
        record_id = await sora2_service.create_record(
            user_uuid=user_uuid,
            prompt=request.prompt,
            model=request.model,
            images=[],
            video_url="",
            status="running",
            remark=f"Model: {request.model}, Aspect: {request.aspect_ratio}, Duration: {request.duration}s"
        )
        logger.info(f"✅ 创建任务记录 #{record_id}")

        # 2. 启动后台异步任务（不等待）
        task = asyncio.create_task(
            sora2_service.generate_video_async(
                record_id=record_id,
                prompt=request.prompt,
                model=request.model,
                user_uuid=user_uuid,
                aspect_ratio=request.aspect_ratio,
                duration=request.duration,
                resolution=request.resolution
            )
        )
        logger.info(f"🚀 后台任务已启动 - Task #{record_id}")

        # 3. 立即返回任务ID（不等待视频生成完成）
        return Sora2GenResponse(
            task_id=str(record_id),
            status="processing",
            message=f"视频生成任务已提交，任务ID: {record_id}"
        )

    except HTTPException:
        # Re-raise HTTPException as-is (don't wrap)
        raise
    except Exception as e:
        logger.error(f"❌ 创建任务失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"创建任务失败: {str(e)}")


@router.get("/sora2/tasks", response_model=Sora2TaskListResponse)
async def get_sora2_tasks(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: Optional[CurrentUser] = Depends(get_current_user_optional)
):
    """
    获取用户的Sora2视频生成任务列表

    Args:
        status: 筛选状态（可选：running/success/failed）
        limit: 返回数量限制（默认50）
        offset: 偏移量（默认0）
        current_user: 当前用户

    Returns:
        任务列表和统计信息
    """
    try:
        # 如果用户未登录，返回空列表
        if not current_user:
            logger.info("📋 未登录用户访问任务列表，返回空列表")
            return Sora2TaskListResponse(
                tasks=[],
                total=0,
                limit=limit,
                offset=offset
            )

        user_uuid = current_user.uuid
        logger.info(f"📋 获取任务列表 - user: {current_user.email}, status: {status}")

        # 获取任务列表
        tasks = await sora2_service.list_user_records(
            user_uuid=user_uuid,
            status=status,
            limit=limit,
            offset=offset
        )

        # 获取总数
        total = await sora2_service.get_user_record_count(
            user_uuid=user_uuid,
            status=status
        )

        logger.info(f"✅ 返回 {len(tasks)} 个任务，总数: {total}")

        return Sora2TaskListResponse(
            tasks=tasks,
            total=total,
            limit=limit,
            offset=offset
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 获取任务列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取任务列表失败: {str(e)}")


@router.get("/sora2/tasks/{task_id}", response_model=Sora2TaskDetail)
async def get_sora2_task(
    task_id: int,
    current_user: Optional[CurrentUser] = Depends(get_current_user_optional)
):
    """
    获取单个Sora2任务的详细信息

    Args:
        task_id: 任务ID
        current_user: 当前用户

    Returns:
        任务详细信息
    """
    try:
        # 获取用户信息
        if not current_user:
            raise HTTPException(status_code=401, detail="未登录")

        user_uuid = current_user.uuid
        logger.info(f"🔍 查询任务 #{task_id} - user: {current_user.email}")

        # 获取任务详情
        task = await sora2_service.get_record(task_id)

        if not task:
            raise HTTPException(status_code=404, detail=f"任务 #{task_id} 不存在")

        # 验证任务所有权
        if task['user_uuid'] != user_uuid:
            raise HTTPException(status_code=403, detail="无权访问此任务")

        logger.info(f"✅ 返回任务 #{task_id} - status: {task['status']}")

        return Sora2TaskDetail(**task)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 获取任务详情失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取任务详情失败: {str(e)}")


@router.delete("/sora2/tasks/{task_id}")
async def delete_sora2_task(
    task_id: int,
    current_user: Optional[CurrentUser] = Depends(get_current_user_optional)
):
    """
    删除Sora2任务

    Args:
        task_id: 任务ID
        current_user: 当前用户

    Returns:
        删除结果
    """
    try:
        # 获取用户信息
        if not current_user:
            raise HTTPException(status_code=401, detail="未登录")

        user_uuid = current_user.uuid
        logger.info(f"🗑️ 删除任务 #{task_id} - user: {current_user.email}")

        # 获取任务详情，验证所有权
        task = await sora2_service.get_record(task_id)

        if not task:
            raise HTTPException(status_code=404, detail=f"任务 #{task_id} 不存在")

        # 验证任务所有权
        if task['user_uuid'] != user_uuid:
            raise HTTPException(status_code=403, detail="无权删除此任务")

        # 删除任务
        await sora2_service.delete_record(task_id)

        logger.info(f"✅ 任务 #{task_id} 已删除")

        return {"success": True, "message": f"任务 #{task_id} 已删除"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 删除任务失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"删除任务失败: {str(e)}")


@router.websocket("/sora2/ws/tasks")
async def websocket_sora2_tasks(
    websocket: WebSocket,
    token: Optional[str] = Query(None)
):
    """
    WebSocket端点：实时推送Sora2任务列表

    路径说明：
    - 使用 /api/sora2/ws/tasks 而不是 /api/ws/sora2/tasks
    - 这样可以复用现有Nginx /socket.io/ 的WebSocket配置
    - 前端访问: wss://www.magicart.cc/socket.io/sora2/tasks

    连接建立后，每5秒自动推送用户的任务列表

    认证方式：
    1. 通过query参数传递token: ws://host/socket.io/sora2/tasks?token=xxx
    2. 通过Cookie传递auth_token（浏览器自动发送）

    消息格式：
    {
        "type": "tasks_update",
        "data": {
            "tasks": [...],
            "total": 10,
            "timestamp": "2025-01-01T00:00:00Z"
        }
    }
    """
    user_uuid = None

    try:
        # 1. 用户认证 - 从query参数或cookie获取token
        auth_token = token
        if not auth_token:
            # 尝试从cookie获取
            cookies = websocket.cookies
            auth_token = cookies.get("auth_token")

        if not auth_token:
            await websocket.close(code=1008, reason="Missing authentication token")
            logger.warning("⚠️ WebSocket connection rejected - no token")
            return

        # 验证token并获取用户信息
        try:
            user = await get_user_from_token(auth_token)
            if not user:
                await websocket.close(code=1008, reason="Invalid token")
                logger.warning("⚠️ WebSocket connection rejected - invalid token")
                return

            user_uuid = user.uuid
            logger.info(f"✅ WebSocket authenticated - user: {user.email}")

        except Exception as e:
            await websocket.close(code=1008, reason=f"Authentication failed: {str(e)}")
            logger.warning(f"⚠️ WebSocket authentication failed: {e}")
            return

        # 2. 接受连接
        await ws_manager.connect(websocket, user_uuid)

        # 3. 发送初始任务列表
        tasks = await sora2_service.list_user_records(
            user_uuid=user_uuid,
            limit=50,
            offset=0
        )
        total = await sora2_service.get_user_record_count(user_uuid=user_uuid)

        await websocket.send_json({
            "type": "tasks_update",
            "data": {
                "tasks": tasks,
                "total": total,
                "timestamp": asyncio.get_event_loop().time()
            }
        })

        logger.info(f"📤 [WS] Sent initial tasks to {user.email}: {len(tasks)} tasks")

        # 4. 启动定期推送任务
        async def push_tasks_periodically():
            """每5秒推送一次任务列表"""
            while True:
                try:
                    await asyncio.sleep(5)

                    # 获取最新任务列表
                    tasks = await sora2_service.list_user_records(
                        user_uuid=user_uuid,
                        limit=50,
                        offset=0
                    )
                    total = await sora2_service.get_user_record_count(user_uuid=user_uuid)

                    # 推送给用户
                    await ws_manager.send_to_user(user_uuid, {
                        "type": "tasks_update",
                        "data": {
                            "tasks": tasks,
                            "total": total,
                            "timestamp": asyncio.get_event_loop().time()
                        }
                    })

                except asyncio.CancelledError:
                    logger.info(f"🛑 [WS] Push task cancelled for {user_uuid[:8]}...")
                    break
                except Exception as e:
                    logger.error(f"❌ [WS] Error pushing tasks to {user_uuid[:8]}...: {e}")
                    break

        # 启动推送任务
        push_task = asyncio.create_task(push_tasks_periodically())

        # 5. 保持连接并监听客户端消息（用于心跳/ping）
        try:
            while True:
                data = await websocket.receive_text()
                # 可以处理客户端发来的消息（如ping/pong）
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
        except WebSocketDisconnect:
            logger.info(f"🔌 Client disconnected - user: {user_uuid[:8]}...")
        finally:
            # 取消推送任务
            push_task.cancel()
            ws_manager.disconnect(websocket, user_uuid)

    except Exception as e:
        logger.error(f"❌ WebSocket error: {e}", exc_info=True)
        if user_uuid:
            ws_manager.disconnect(websocket, user_uuid)

# ==================== Sora2 分享相关路由 ====================

class CreateShareRequest(BaseModel):
    """创建分享请求"""
    video_id: int = Field(..., description="视频ID")


class CreateShareResponse(BaseModel):
    """创建分享响应"""
    share_id: str = Field(..., description="分享ID")
    share_url: str = Field(..., description="分享链接")
    views: int = Field(default=0, description="访问量")
    likes: int = Field(default=0, description="点赞量")


class ShareVideoDetail(BaseModel):
    """分享视频详情"""
    prompt: str = Field(..., description="提示词")
    video_url: str = Field(..., description="视频URL")
    views: int = Field(..., description="访问量")
    likes: int = Field(..., description="点赞量")


@router.post("/sora2/share", response_model=CreateShareResponse)
async def create_sora2_share(
    request: CreateShareRequest,
    current_user: CurrentUser = Depends(get_current_user_optional)
):
    """
    创建视频分享链接
    
    Args:
        request: 创建分享请求
        current_user: 当前用户
        
    Returns:
        分享信息（share_id, share_url等）
    """
    try:
        # 验证用户登录
        if not current_user:
            raise HTTPException(status_code=401, detail="请先登录")
        
        user_uuid = current_user.uuid
        video_id = request.video_id
        
        logger.info(f"📤 创建分享 - user: {current_user.email}, video_id: {video_id}")
        
        # 验证视频是否存在且属于当前用户
        task = await sora2_service.get_record(video_id)
        if not task:
            raise HTTPException(status_code=404, detail=f"视频 #{video_id} 不存在")
        
        if task["user_uuid"] != user_uuid:
            raise HTTPException(status_code=403, detail="无权分享此视频")
        
        # 验证视频状态
        if task["status"] != "success":
            raise HTTPException(status_code=400, detail="只能分享已完成的视频")

        # 创建或获取分享记录（使用环境变量配置的BASE_URL）
        share_service = get_sora2_share_service()
        share_record = await share_service.create_share(
            user_uuid=user_uuid,
            video_id=video_id,
            base_url=BASE_URL
        )
        
        logger.info(f"✅ 分享创建成功 - share_id: {share_record['share_id']}")
        
        return CreateShareResponse(
            share_id=share_record["share_id"],
            share_url=share_record["share_url"],
            views=share_record["views"],
            likes=share_record["likes"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 创建分享失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"创建分享失败: {str(e)}")


@router.get("/sora2/share/{share_id}", response_model=ShareVideoDetail)
async def get_sora2_share(share_id: str):
    """
    获取分享视频详情（公开访问，无需登录）
    
    Args:
        share_id: 分享ID
        
    Returns:
        视频详情（prompt, video_url, views, likes）
    """
    try:
        logger.info(f"👁️ 访问分享 - share_id: {share_id}")
        
        # 获取分享服务
        share_service = get_sora2_share_service()
        
        # 获取视频信息
        video = await share_service.get_video_by_share_id(share_id)
        
        if not video:
            raise HTTPException(status_code=404, detail="分享不存在或已失效")
        
        # 增加访问量
        await share_service.increment_views(share_id)
        
        logger.info(f"✅ 分享访问成功 - share_id: {share_id}, views: {video['views'] + 1}")
        
        return ShareVideoDetail(
            prompt=video["prompt"],
            video_url=video["video_url"],
            views=video["views"] + 1,  # 返回更新后的访问量
            likes=video["likes"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 获取分享失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取分享失败: {str(e)}")


@router.post("/sora2/share/{share_id}/like")
async def like_sora2_share(share_id: str):
    """
    点赞分享视频（无需登录）

    Args:
        share_id: 分享ID

    Returns:
        更新后的点赞数
    """
    try:
        logger.info(f"👍 点赞分享 - share_id: {share_id}")

        # 获取分享服务
        share_service = get_sora2_share_service()

        # 验证分享是否存在
        share_record = await share_service.get_share_by_id(share_id)
        if not share_record:
            raise HTTPException(status_code=404, detail="分享不存在或已失效")

        # 增加点赞量
        success = await share_service.increment_likes(share_id)

        if not success:
            raise HTTPException(status_code=500, detail="点赞失败")

        # 获取更新后的点赞数
        updated_share = await share_service.get_share_by_id(share_id)

        logger.info(f"✅ 点赞成功 - share_id: {share_id}, likes: {updated_share['likes']}")

        return {
            "success": True,
            "likes": updated_share["likes"]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 点赞失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"点赞失败: {str(e)}")


# ==================== Sora2 发现页面相关路由 ====================

@router.get("/sora2/discover", response_model=Sora2TaskListResponse)
async def get_discover_videos(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0)
):
    """
    获取所有用户的成功视频（发现页面）

    Args:
        limit: 每页数量（1-100，默认50）
        offset: 偏移量（默认0）

    Returns:
        视频列表和统计信息
    """
    try:
        logger.info(f"📋 获取发现页面视频列表 - limit: {limit}, offset: {offset}")

        # 获取视频列表
        videos = await sora2_service.list_all_success_videos(
            limit=limit,
            offset=offset
        )

        # 获取总数
        total = await sora2_service.get_all_success_videos_count()

        logger.info(f"✅ 返回 {len(videos)} 个视频，总数: {total}")

        return Sora2TaskListResponse(
            tasks=videos,
            total=total,
            limit=limit,
            offset=offset
        )

    except Exception as e:
        logger.error(f"❌ 获取发现页面视频列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取视频列表失败: {str(e)}")
