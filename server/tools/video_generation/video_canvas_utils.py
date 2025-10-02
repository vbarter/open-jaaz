"""
Video canvas utilities module
Contains functions for video processing, canvas operations, and notifications
"""

import json
import time
import os
import asyncio
from contextlib import asynccontextmanager
from typing import Dict, List, Any, Tuple, Optional, Union
from services.config_service import FILES_DIR
from services.db_service import db_service
from services.websocket_service import send_to_websocket, broadcast_session_update  # type: ignore
from common import DEFAULT_PORT, BASE_URL
from utils.http_client import HttpClient
import aiofiles
import mimetypes
from pymediainfo import MediaInfo
from nanoid import generate
import random
from utils.canvas import find_next_best_element_position, layout_config


class CanvasLockManager:
    """Canvas lock manager to prevent concurrent operations causing position overlap"""

    def __init__(self) -> None:
        self._locks: Dict[str, asyncio.Lock] = {}

    @asynccontextmanager
    async def lock_canvas(self, canvas_id: str):
        if canvas_id not in self._locks:
            self._locks[canvas_id] = asyncio.Lock()

        async with self._locks[canvas_id]:
            yield


# Global lock manager instance
canvas_lock_manager = CanvasLockManager()

def _calculate_video_optimal_size(original_width: int, original_height: int) -> tuple[int, int]:
    """
    计算视频的最优显示尺寸，保持16:9比例
    
    Args:
        original_width: 原始宽度
        original_height: 原始高度
        
    Returns:
        tuple[int, int]: (优化后的宽度, 优化后的高度)
    """
    # 标准16:9比例
    target_ratio = 16 / 9
    
    # 最大尺寸限制 - 允许更大的视频
    max_width = min(layout_config.standard_width * 1.5, 960)  # 最大960px宽
    max_height = min(layout_config.standard_height * 1.5, 540)  # 最大540px高

    # 如果原始尺寸在合理范围内，直接使用
    if original_width <= max_width and original_height <= max_height:
        return original_width, original_height

    # 按照16:9比例和最大宽度计算 - 使用标准尺寸作为默认值
    optimal_width = min(max_width, layout_config.standard_width)
    optimal_height = int(optimal_width / target_ratio)
    
    # 确保高度不超过限制
    if optimal_height > max_height:
        optimal_height = max_height
        optimal_width = int(optimal_height * target_ratio)
    
    return optimal_width, optimal_height


async def save_video_to_canvas(
    session_id: str,
    canvas_id: str,
    video_url: str
) -> Tuple[str, Dict[str, Any], Dict[str, Any]]:
    """
    Create canvas element for video using the original URL directly

    Args:
        session_id: Session ID for notifications
        canvas_id: Canvas ID to add video element
        video_url: URL of the video (e.g., filesystem.site URL)

    Returns:
        Tuple of (filename, file_data, new_video_element)
    """
    # Use lock to ensure atomicity of the save process
    async with canvas_lock_manager.lock_canvas(canvas_id):
        # Generate unique video ID for the element
        video_id = generate_video_file_id()

        # Extract filename from URL for display purposes
        filename = video_url.split('/')[-1] if '/' in video_url else f"{video_id}.mp4"

        print(f"🎥 Using video directly from: {video_url}")

        # Use default dimensions for video (16:9 aspect ratio)
        # These can be overridden by the actual video dimensions when loaded in frontend
        width = 720
        height = 1280  # Common vertical video dimensions

        # Create file data using the original URL directly
        file_data: Dict[str, Any] = {
            "mimeType": "video/mp4",
            "id": video_id,
            "dataURL": video_url,  # Use the original URL directly
            "created": int(time.time() * 1000),
        }

        # Create new video element for canvas
        new_video_element: Dict[str, Any] = await generate_new_video_element(
            canvas_id,
            video_id,
            {
                "width": width,
                "height": height,
            },
            video_url=video_url  # Pass the original video URL directly
        )

        # Update canvas data
        canvas_data: Optional[Dict[str, Any]] = await db_service.get_canvas_data(canvas_id)
        if canvas_data is None:
            canvas_data = {}
        if "data" not in canvas_data:
            canvas_data["data"] = {}
        if "elements" not in canvas_data["data"]:
            canvas_data["data"]["elements"] = []
        if "files" not in canvas_data["data"]:
            canvas_data["data"]["files"] = {}

        canvas_data["data"]["elements"].append(
            new_video_element)  # type: ignore
        canvas_data["data"]["files"][video_id] = file_data  # Use video_id instead of file_id

        # Save updated canvas data
        await db_service.save_canvas_data(canvas_id, json.dumps(canvas_data["data"]))

        return filename, file_data, new_video_element


async def send_video_start_notification(session_id: str, message: str) -> None:
    """Send WebSocket notification about video generation start"""
    await send_to_websocket(session_id, {
        "type": "video_generation_started",
        "message": message
    })


async def send_video_completion_notification(
    session_id: str,
    canvas_id: str,
    new_video_element: Dict[str, Any],
    file_data: Dict[str, Any],
    video_url: str
) -> None:
    """Send WebSocket notification about video generation completion"""
    await broadcast_session_update(
        session_id,
        canvas_id,
        {
            "type": "video_generated",
            "element": new_video_element,
            "file": file_data,
            "video_url": video_url,
        },
    )


async def send_video_error_notification(session_id: str, error_message: str) -> None:
    """Send WebSocket notification about video generation error"""
    print(f"🎥 Video generation error: {error_message}")
    await send_to_websocket(session_id, {
        "type": "error",
        "error": error_message
    })


def format_video_success_message(filename: str, session_id: str = None, canvas_id: str = None) -> str:
    """🆕 [CHAT_DUAL_DISPLAY] Format success message for video generation - 双重显示"""
    # 📝 [CHAT_DEBUG] 记录视频生成信息
    from log import get_logger
    logger = get_logger(__name__)
    video_url = f"{BASE_URL}/api/file/{filename}?redirect=true"
    logger.info(f"🎬 [CHAT_DEBUG] 视频生成完成: filename={filename}")
    logger.info(f"🎬 [CHAT_DEBUG] 视频URL: {video_url}")
    
    # 🆕 [CHAT_DUAL_DISPLAY] 实现聊天+画布双重显示
    logger.info(f"🎬 [CHAT_DUAL_DISPLAY] 视频双重显示:")
    logger.info(f"   📱 聊天显示URL: {video_url}")
    logger.info(f"   🎨 画布显示通过其他机制处理")
    
    # 聊天响应包含视频预览 + 提示文本
    return f"🎬 视频已生成并添加到画布\n\n![{filename}]({video_url})"


async def process_video_result(
    video_url: str,
    session_id: str,
    canvas_id: str,
    provider_name: str = ""
) -> str:
    """
    Complete video processing pipeline: save, update canvas, notify

    Args:
        video_url: URL of the generated video
        session_id: Session ID for notifications
        canvas_id: Canvas ID to add video element
        provider_name: Name of the provider (for logging)

    Returns:
        Success message with video link
    """
    try:
        # Save video to canvas and get file info
        filename, file_data, new_video_element = await save_video_to_canvas(
            session_id=session_id,
            canvas_id=canvas_id,
            video_url=video_url
        )

        # Send completion notification
        await send_video_completion_notification(
            session_id=session_id,
            canvas_id=canvas_id,
            new_video_element=new_video_element,
            file_data=file_data,
            video_url=file_data["dataURL"]
        )

        provider_info = f" using {provider_name}" if provider_name else ""
        print(f"🎥 Video generation completed{provider_info}: {filename}")
        return format_video_success_message(filename)

    except Exception as e:
        error_message = str(e)
        await send_video_error_notification(session_id, error_message)
        raise e


def generate_video_file_id() -> str:
    return "vi_" + generate(size=8)


async def get_video_info_and_save(
    url: str, file_path_without_extension: str
) -> Tuple[str, int, int, str]:
    # Fetch the video asynchronously
    async with HttpClient.create_aiohttp() as session:
        async with session.get(url) as response:
            video_content = await response.read()

    # Save to temporary mp4 file first
    temp_path = f"{file_path_without_extension}.mp4"
    async with aiofiles.open(temp_path, "wb") as out_file:
        await out_file.write(video_content)
    print("🎥 Video saved to", temp_path)

    try:
        media_info = MediaInfo.parse(temp_path)  # type: ignore
        width: int = 0
        height: int = 0

        for track in media_info.tracks:  # type: ignore
            if track.track_type == "Video":  # type: ignore
                width = int(track.width or 0)  # type: ignore
                height = int(track.height or 0)  # type: ignore
                print(f"Width: {width}, Height: {height}")
                break

        extension = "mp4"  # Default to mp4, can be flexible based on codec_name

        # Get mime type
        mime_type = mimetypes.types_map.get(".mp4", "video/mp4")

        print(
            f"🎥 Video info - width: {width}, height: {height}, mime_type: {mime_type}, extension: {extension}"
        )

        return mime_type, width, height, extension
    except Exception as e:
        print(f"Error probing video file {temp_path}: {str(e)}")
        raise e


async def generate_new_video_element(
    canvas_id: str,
    fileid: str,
    video_data: Dict[str, Any],
    canvas_data: Optional[Dict[str, Any]] = None,
    use_standard_size: bool = True,
    video_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate new video element for canvas with improved layout

    Args:
        canvas_id: 画布ID
        fileid: 文件ID
        video_data: 视频数据
        canvas_data: 画布数据（可选）
        use_standard_size: 是否使用标准化尺寸（推荐）
        video_url: 视频URL（用于embeddable元素的link属性）
    """
    if canvas_data is None:
        canvas = await db_service.get_canvas_data(canvas_id)
        if canvas is None:
            canvas = {"data": {}}
        canvas_data = canvas.get("data", {})

    # 获取视频原始尺寸
    original_width = video_data.get("width", layout_config.standard_width)
    original_height = video_data.get("height", layout_config.standard_height)

    # 决定使用的尺寸（视频通常使用标准尺寸以保证一致性）
    if use_standard_size:
        display_width = layout_config.standard_width
        display_height = layout_config.standard_height
    else:
        # 对于视频，计算保持16:9比例的适当尺寸
        display_width, display_height = _calculate_video_optimal_size(original_width, original_height)

    # 使用新的布局算法计算位置
    new_x, new_y = await find_next_best_element_position(
        canvas_data,
        element_width=display_width,
        element_height=display_height,
        force_standard_size=use_standard_size
    )

    # 使用提供的video_url，如果没有提供则生成默认URL
    if not video_url:
        # 备用：如果没有提供URL，使用本地文件URL
        video_url = f"/api/file/{fileid}.mp4"

    return {
        "type": "embeddable",  # embeddable类型用于视频
        "id": fileid,
        "x": new_x,
        "y": new_y,
        "width": display_width,
        "height": display_height,
        "angle": 0,
        "fileId": fileid,
        "strokeColor": "#000000",
        "fillStyle": "solid",
        "strokeStyle": "solid",
        "boundElements": None,
        "roundness": None,
        "frameId": None,
        "backgroundColor": "transparent",
        "strokeWidth": 1,
        "roughness": 0,
        "opacity": 100,
        "groupIds": [],
        "seed": int(random.random() * 1000000),
        "version": 1,
        "versionNonce": int(random.random() * 1000000),
        "isDeleted": False,
        "index": None,
        "updated": 0,
        "link": video_url,  # 使用传入的视频URL（filesystem.site或其他）
        "locked": False,
        "status": "saved",
        "scale": [1, 1],
        "crop": None,
    }
