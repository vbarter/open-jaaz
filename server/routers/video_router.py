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
from log import get_logger
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
        user_email = current_user.email if current_user else "anonymous"
        user_uuid = current_user.uuid if current_user else "anonymous"
        logger.info(f"👤 用户: {user_email}")

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


@router.websocket("/ws/sora2/tasks")
async def websocket_sora2_tasks(
    websocket: WebSocket,
    token: Optional[str] = Query(None)
):
    """
    WebSocket端点：实时推送Sora2任务列表

    连接建立后，每2秒自动推送用户的任务列表

    认证方式：
    1. 通过query参数传递token: ws://host/api/ws/sora2/tasks?token=xxx
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
            """每2秒推送一次任务列表"""
            while True:
                try:
                    await asyncio.sleep(2)

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
