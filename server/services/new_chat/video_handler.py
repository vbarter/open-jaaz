import os
import uuid
import json
import asyncio
import aiohttp
from typing import Dict, Any, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

async def handle_video_generation(
    session_id: str,
    canvas_id: str,
    prompt: str,
    tuzi_service,
    user_language: str = 'zh'
) -> Dict[str, Any]:
    """
    处理视频生成请求

    Args:
        session_id: 会话ID
        canvas_id: 画布ID
        prompt: 视频生成提示词
        tuzi_service: Tuzi LLM服务实例
        user_language: 用户语言

    Returns:
        包含视频URL和相关信息的字典
    """
    try:
        logger.info(f"🎥 开始生成视频: session_id={session_id}, canvas_id={canvas_id}")
        logger.info(f"📝 视频提示词: {prompt}")

        # 调用视频生成服务
        video_result = await tuzi_service.generate_video(
            prompt=prompt,
            model="veo3-fast-frames",
            resolution="480p",
            duration=5,
            aspect_ratio="9:16"
        )

        if not video_result or 'error' in video_result:
            error_msg = video_result.get('error', 'Unknown error') if video_result else 'No response'
            logger.error(f"❌ 视频生成失败: {error_msg}")
            raise Exception(f"视频生成失败: {error_msg}")

        # 获取视频URL
        video_url = video_result.get('result_url', '')
        if not video_url:
            logger.error("❌ 视频生成成功但没有返回URL")
            raise Exception("视频生成成功但没有返回URL")

        logger.info(f"✅ 视频生成成功: {video_url}")

        # 生成唯一的视频ID
        video_id = str(uuid.uuid4())

        # 创建视频元素数据（用于Excalidraw）
        element_data = {
            'id': video_id,
            'type': 'embeddable',
            'x': 100,  # 默认位置
            'y': 100,
            'width': 640,  # 默认尺寸
            'height': 360,
            'link': video_url,
            'locked': False,
            'isDeleted': False,
            'groupIds': [],
            'strokeColor': '#000000',
            'backgroundColor': 'transparent',
            'fillStyle': 'solid',
            'strokeWidth': 1,
            'strokeStyle': 'solid',
            'roughness': 1,
            'opacity': 100,
            'angle': 0,
            'seed': int(datetime.now().timestamp() * 1000),
            'version': 1,
            'versionNonce': int(datetime.now().timestamp() * 1000),
            'boundElements': [],
            'updated': int(datetime.now().timestamp() * 1000),
            'frameId': None,
            'index': None,
            'customData': {}
        }

        # 准备WebSocket事件数据
        event_data = {
            'type': 'video_generated',
            'session_id': session_id,
            'canvas_id': canvas_id,
            'element': element_data,
            'video_url': video_url,
            'file': {
                'mimeType': 'video/mp4',
                'id': video_id,
                'dataURL': video_url,
                'created': int(datetime.now().timestamp() * 1000),
                'lastRetrieved': int(datetime.now().timestamp() * 1000),
                'duration': video_result.get('duration', 5)
            }
        }

        # 发送WebSocket事件（注意：send_to_websocket只需要2个参数）
        from services.websocket_service import send_to_websocket
        logger.info(f"🎬 [VIDEO_DEBUG] 准备发送video_generated事件: session_id={session_id}, type={event_data.get('type')}")
        await send_to_websocket(session_id, event_data)
        logger.info(f"📤 [VIDEO_DEBUG] 已发送视频生成事件到前端: session_id={session_id}, video_url={video_url[:50]}...")

        # 返回聊天响应（包含type字段以便前端识别）
        from services.i18n_service import i18n_service
        localized_message = i18n_service.get_video_generated_message(user_language)

        return {
            'role': 'assistant',
            'content': localized_message,  # 只使用本地化消息，避免重复
            'type': 'video',  # 添加类型标识
            'video_url': video_url,
            'video_id': video_id,
            'canvas_id': canvas_id,
            'metadata': {
                'width': element_data['width'],
                'height': element_data['height'],
                'duration': video_result.get('duration', 5)
            }
        }

    except Exception as e:
        logger.error(f"❌ 处理视频生成时出错: {e}")

        # 返回错误消息
        from utils.error_messages import get_user_friendly_error
        return {
            'role': 'assistant',
            'content': get_user_friendly_error(str(e))
        }

async def save_video_to_local(video_url: str, session_id: str) -> str:
    """
    下载视频并保存到本地（如果需要）

    Args:
        video_url: 远程视频URL
        session_id: 会话ID

    Returns:
        本地视频路径
    """
    try:
        # 创建视频保存目录
        video_dir = f"./static/videos/{session_id}"
        os.makedirs(video_dir, exist_ok=True)

        # 生成文件名
        video_id = str(uuid.uuid4())
        file_path = f"{video_dir}/{video_id}.mp4"

        # 下载视频
        async with aiohttp.ClientSession() as session:
            async with session.get(video_url) as response:
                if response.status == 200:
                    content = await response.read()
                    with open(file_path, 'wb') as f:
                        f.write(content)

                    logger.info(f"✅ 视频已保存到本地: {file_path}")

                    # 返回相对路径供前端访问
                    return f"/static/videos/{session_id}/{video_id}.mp4"
                else:
                    logger.error(f"❌ 下载视频失败: HTTP {response.status}")
                    return video_url  # 返回原始URL

    except Exception as e:
        logger.error(f"❌ 保存视频到本地失败: {e}")
        return video_url  # 返回原始URL