"""
Sora2 WebSocket 独立路由
不使用 /api 前缀，避免被 Nginx location / 的错误配置捕获
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Optional, Dict
from utils.auth_utils import get_user_from_token
from services.sora2_service import sora2_service
from log import get_logger
import asyncio

logger = get_logger(__name__)

# 创建独立的router，不使用 /api 前缀
router = APIRouter()


# WebSocket连接管理器（复用video_router中的逻辑）
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
        logger.info(f"🔌 [Sora WS] 连接成功 - user: {user_uuid[:8]}..., 连接数: {len(self.active_connections[user_uuid])}")

    def disconnect(self, websocket: WebSocket, user_uuid: str):
        """移除断开的连接"""
        if user_uuid in self.active_connections:
            self.active_connections[user_uuid].remove(websocket)
            if not self.active_connections[user_uuid]:
                del self.active_connections[user_uuid]
        logger.info(f"🔌 [Sora WS] 连接断开 - user: {user_uuid[:8]}...")

    async def send_to_user(self, user_uuid: str, message: dict):
        """向指定用户的所有连接发送消息"""
        if user_uuid not in self.active_connections:
            return

        dead_connections = []
        for websocket in self.active_connections[user_uuid]:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning(f"⚠️ [Sora WS] 发送消息失败 {user_uuid[:8]}...: {e}")
                dead_connections.append(websocket)

        # 清理死连接
        for websocket in dead_connections:
            self.disconnect(websocket, user_uuid)


# 全局连接管理器
ws_manager = ConnectionManager()


@router.websocket("/ws-sora2/tasks")
async def websocket_sora2_tasks(
    websocket: WebSocket,
    token: Optional[str] = Query(None)
):
    """
    WebSocket端点：实时推送Sora2任务列表

    路径说明：
    - 使用 /ws-sora2/tasks （不带 /api 前缀）
    - 需要在Nginx中添加专门的 location 配置（见下方说明）
    - 前端访问: wss://www.magicart.cc/ws-sora2/tasks

    连接建立后，每5秒自动推送用户的任务列表

    认证方式：
    1. 通过query参数传递token: ws://host/ws-sora2/tasks?token=xxx
    2. 通过Cookie传递auth_token（浏览器自动发送）

    消息格式：
    {
        "type": "tasks_update",
        "data": {
            "tasks": [...],
            "total": 10,
            "timestamp": 1234567890
        }
    }

    Nginx 配置要求（添加到 www.magicart.cc server 块）：
    ```nginx
    location /ws-sora2/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_connect_timeout 75s;
        proxy_buffering off;
    }
    ```
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
            logger.warning("⚠️ [Sora WS] 连接被拒绝 - 缺少token")
            return

        # 验证token并获取用户信息
        try:
            user = await get_user_from_token(auth_token)
            if not user:
                await websocket.close(code=1008, reason="Invalid token")
                logger.warning("⚠️ [Sora WS] 连接被拒绝 - token无效")
                return

            user_uuid = user.uuid
            logger.info(f"✅ [Sora WS] 认证成功 - user: {user.email}")

        except Exception as e:
            await websocket.close(code=1008, reason=f"Authentication failed: {str(e)}")
            logger.warning(f"⚠️ [Sora WS] 认证失败: {e}")
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

        logger.info(f"📤 [Sora WS] 发送初始任务列表: {len(tasks)} 个任务")

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
                    logger.info(f"🛑 [Sora WS] 推送任务已取消 - {user_uuid[:8]}...")
                    break
                except Exception as e:
                    logger.error(f"❌ [Sora WS] 推送任务失败 - {user_uuid[:8]}...: {e}")
                    break

        # 启动推送任务
        push_task = asyncio.create_task(push_tasks_periodically())

        # 5. 保持连接并监听客户端消息（用于心跳/ping）
        try:
            while True:
                data = await websocket.receive_text()
                # 处理客户端发来的消息（如ping/pong）
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
                    logger.debug(f"💓 [Sora WS] Pong sent to {user_uuid[:8]}...")
        except WebSocketDisconnect:
            logger.info(f"🔌 [Sora WS] 客户端断开连接 - {user_uuid[:8]}...")
        finally:
            # 取消推送任务
            push_task.cancel()
            try:
                await push_task
            except asyncio.CancelledError:
                pass
            ws_manager.disconnect(websocket, user_uuid)

    except Exception as e:
        logger.error(f"❌ [Sora WS] WebSocket错误: {e}", exc_info=True)
        if user_uuid:
            ws_manager.disconnect(websocket, user_uuid)
