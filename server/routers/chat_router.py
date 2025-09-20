#server/routers/chat_router.py
from fastapi import APIRouter, Request, Depends, HTTPException
from services.new_chat import handle_chat
from services.magic_service import handle_magic
from services.stream_service import get_stream_task
from services.i18n_service import i18n_service
from utils.auth_utils import get_current_user_optional, CurrentUser
from typing import Dict, Optional
from log import get_logger
import asyncio
import time

logger = get_logger(__name__)

router = APIRouter(prefix="/api")

# 防重复机制 - 存储正在处理的session_id和最后请求时间
_active_magic_sessions = set()
_session_last_request = {}

@router.post("/chat")
async def chat(request: Request, current_user: Optional[CurrentUser] = Depends(get_current_user_optional)):
    """
    Endpoint to handle chat requests.

    Receives a JSON payload from the client, passes it to the chat handler,
    and returns a success status.

    Request body:
        JSON object containing chat data.

    Response:
        {"status": "done"}
    """
    data = await request.json()
    
    # 🔍 添加用户信息到请求数据中
    if current_user:
        data['user_info'] = {
            'id': current_user.id,
            'uuid': current_user.uuid,
            'email': current_user.email,
            'nickname': current_user.nickname,
            'language': data.get('language', 'en')  # 添加语言信息
        }
    
    await handle_chat(data)
    return {"status": "done"}

@router.post("/cancel/{session_id}")
async def cancel_chat(session_id: str):
    """
    Endpoint to cancel an ongoing stream task for a given session_id.

    If the task exists and is not yet completed, it will be cancelled.

    Path parameter:
        session_id (str): The ID of the session whose task should be cancelled.

    Response:
        {"status": "cancelled"} if the task was cancelled.
        {"status": "not_found_or_done"} if no such task exists or it is already done.
    """
    task = get_stream_task(session_id)
    if task and not task.done():
        task.cancel()
        return {"status": "cancelled"}
    return {"status": "not_found_or_done"}

@router.post("/magic")
async def magic(request: Request, current_user: Optional[CurrentUser] = Depends(get_current_user_optional)):
    """
    Endpoint to handle magic generation requests.

    Receives a JSON payload from the client, passes it to the magic handler,
    and returns a success status.

    Request body:
        JSON object containing magic generation data.

    Response:
        {"status": "done"}
    """
    try:
        logger.info("[Backend Magic] 接收到Magic Generation请求")

        # 解析请求数据
        data = await request.json()
        session_id = data.get('session_id', '')

        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")

        logger.info(f"[Backend Magic] 请求数据解析成功: session_id={session_id}, canvas_id={data.get('canvas_id', 'N/A')}, messages_count={len(data.get('messages', []))}")

        # 🛡️ 防重复机制检查
        current_time = time.time()

        # 检查是否已有相同session正在处理
        if session_id in _active_magic_sessions:
            logger.warning(f"[Backend Magic] Session {session_id} 正在处理中，拒绝重复请求")
            return {"status": "already_processing", "message": "Another magic generation is already in progress for this session"}

        # 检查请求频率限制（2秒内不允许重复请求）
        if session_id in _session_last_request:
            time_diff = current_time - _session_last_request[session_id]
            if time_diff < 2.0:  # 2秒内不允许重复请求
                logger.warning(f"[Backend Magic] Session {session_id} 请求过于频繁 (间隔: {time_diff:.2f}s)，拒绝请求")
                return {"status": "rate_limited", "message": "Requests too frequent, please wait"}

        # 标记session为正在处理
        _active_magic_sessions.add(session_id)
        _session_last_request[session_id] = current_time
        logger.info(f"[Backend Magic] Session {session_id} 已标记为处理中")

        # 🔍 添加用户信息到请求数据中
        if current_user:
            data['user_info'] = {
                'id': current_user.id,
                'uuid': current_user.uuid,
                'email': current_user.email,
                'nickname': current_user.nickname
            }
            logger.info(f"[Backend Magic] 用户信息已添加: user_id={current_user.id}, email={current_user.email}")
        else:
            logger.warning("[Backend Magic] 无用户信息")

        # 立即启动异步magic生成任务，不等待完成
        # 这样前端可以立即得到响应，不会被阻塞

        # 添加错误处理包装，确保异步任务中的错误不会影响API响应
        async def safe_handle_magic():
            try:
                logger.info("[Backend Magic] 开始调用handle_magic")
                await handle_magic(data)
                logger.info("[Backend Magic] handle_magic调用完成")
            except Exception as e:
                logger.error(f"[Backend Magic] Async magic generation failed: {e}")
                logger.error(f"[Backend Magic] 错误详情: {type(e).__name__}: {str(e)}")
                # 通过WebSocket通知前端错误
                if session_id:
                    from services.websocket_service import send_to_websocket
                    await send_to_websocket(session_id, {
                        'type': 'error',
                        'error': f'Magic generation failed: {str(e)}'
                    })
            finally:
                # 无论成功或失败，都要清理session状态
                if session_id in _active_magic_sessions:
                    _active_magic_sessions.remove(session_id)
                    logger.info(f"[Backend Magic] Session {session_id} 已从活跃列表中移除")

        logger.info("[Backend Magic] 创建异步任务")
        asyncio.create_task(safe_handle_magic())

        logger.info("[Backend Magic] 返回状态started")
        return {"status": "started"}
        
    except Exception as e:
        logger.error(f"Magic generation error: {e}")
        # 检查是否是文件过大错误
        error_msg = str(e).lower()
        if "413" in error_msg or "too large" in error_msg or "entity too large" in error_msg:
            raise HTTPException(
                status_code=413,
                detail="Image file is too large. Please use an image smaller than 50MB."
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Magic generation failed: {str(e)}"
            )

@router.post("/magic/cancel/{session_id}")
async def cancel_magic(session_id: str) -> Dict[str, str]:
    """
    Endpoint to cancel an ongoing magic generation task for a given session_id.

    If the task exists and is not yet completed, it will be cancelled.

    Path parameter:
        session_id (str): The ID of the session whose task should be cancelled.

    Response:
        {"status": "cancelled"} if the task was cancelled.
        {"status": "not_found_or_done"} if no such task exists or it is already done.
    """
    task = get_stream_task(session_id)
    if task and not task.done():
        task.cancel()
        return {"status": "cancelled"}
    return {"status": "not_found_or_done"}
