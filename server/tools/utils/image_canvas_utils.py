"""
Canvas-related utilities for image generation
Handles canvas operations, locking, and notifications
"""

import asyncio
import os
import random
import time
import json
from contextlib import asynccontextmanager
from typing import Dict, List, Any, Optional, Union, cast
from nanoid import generate
from services.db_service import db_service
from services.websocket_service import broadcast_session_update
from services.websocket_service import send_to_websocket
from utils.cos_image_service import get_cos_image_service
from services.config_service import config_service, SERVER_DIR
from utils.canvas import find_next_best_element_position, layout_config
from utils.cos_image_service import get_cos_image_service
from utils.url_converter import get_canvas_image_url, get_optimal_image_url
from common import BASE_URL

def generate_file_id() -> str:
    """Generate unique file ID"""
    return 'im_' + generate(size=8)

def _calculate_optimal_size(original_width: int, original_height: int) -> tuple[int, int]:
    """
    计算图片的最优显示尺寸 - 新策略：尽量保持原始尺寸
    
    Args:
        original_width: 原始宽度
        original_height: 原始高度
        
    Returns:
        tuple[int, int]: (优化后的宽度, 优化后的高度)
    """
    print(f"   🔍 [SIZE_CALC] 开始计算最优尺寸:")
    print(f"      输入: {original_width} x {original_height}")
    
    # 更宽松的尺寸限制 - 允许更大的变化范围
    max_width = layout_config.standard_width * 3    # 最大允许3倍标准宽度
    max_height = layout_config.standard_height * 3  # 最大允许3倍标准高度
    
    # 最小尺寸限制
    min_width = 100   # 最小100px宽度 
    min_height = 60   # 最小60px高度
    
    print(f"      限制: 宽度 {min_width}-{max_width}, 高度 {min_height}-{max_height}")
    
    # 如果原始尺寸在合理范围内，直接使用（优先保持原始尺寸）
    if (min_width <= original_width <= max_width and 
        min_height <= original_height <= max_height):
        print(f"      ✅ 原始尺寸在合理范围内，保持不变")
        return original_width, original_height
    
    # 只在尺寸过大时才进行缩放
    if original_width > max_width or original_height > max_height:
        # 计算缩放比例，保持宽高比
        width_ratio = max_width / original_width if original_width > max_width else 1
        height_ratio = max_height / original_height if original_height > max_height else 1
        
        # 使用较小的缩放比例以确保不超出限制
        scale_ratio = min(width_ratio, height_ratio)
        
        # 计算缩放后的尺寸
        scaled_width = int(original_width * scale_ratio)
        scaled_height = int(original_height * scale_ratio)
        
        print(f"      📏 尺寸过大，缩放比例: {scale_ratio:.2f}")
        print(f"      📐 缩放后: {scaled_width} x {scaled_height}")
        
        return scaled_width, scaled_height
    
    # 如果尺寸过小，进行适当放大
    if original_width < min_width or original_height < min_height:
        width_ratio = min_width / original_width if original_width < min_width else 1
        height_ratio = min_height / original_height if original_height < min_height else 1
        
        # 使用较大的缩放比例确保满足最小尺寸
        scale_ratio = max(width_ratio, height_ratio)
        
        scaled_width = int(original_width * scale_ratio)
        scaled_height = int(original_height * scale_ratio)
        
        print(f"      📏 尺寸过小，放大比例: {scale_ratio:.2f}")
        print(f"      📐 放大后: {scaled_width} x {scaled_height}")
        
        return scaled_width, scaled_height
    
    # 默认返回原始尺寸
    print(f"      ✅ 默认保持原始尺寸")
    return original_width, original_height


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



async def generate_new_image_element(
    canvas_id: str,
    fileid: str,
    image_data: Dict[str, Any],
    canvas_data: Optional[Dict[str, Any]] = None,
    use_standard_size: bool = False,  # 保持原始尺寸，避免图片变形
) -> Dict[str, Any]:
    """
    Generate new image element for canvas with improved layout
    
    Args:
        canvas_id: 画布ID
        fileid: 文件ID
        image_data: 图片数据
        canvas_data: 画布数据（可选）
        use_standard_size: 是否使用标准化尺寸（默认False保持原始尺寸）
    """
    if canvas_data is None:
        canvas = await db_service.get_canvas_data(canvas_id)
        if canvas is None:
            canvas = {"data": {}}
        canvas_data = canvas.get("data", {})

    # 获取图片原始尺寸
    original_width = image_data.get("width", layout_config.standard_width)
    original_height = image_data.get("height", layout_config.standard_height)
    
    # 添加详细日志
    print(f"🖼️ [IMAGE_CANVAS] 处理图片元素:")
    print(f"   📄 文件ID: {fileid}")
    print(f"   📐 原始尺寸: {original_width} x {original_height}")
    print(f"   ⚙️ 使用标准尺寸: {use_standard_size}")
    
    # 决定使用的尺寸
    if use_standard_size:
        # 使用标准化尺寸确保整齐排列
        display_width = layout_config.standard_width
        display_height = layout_config.standard_height
        print(f"   🎯 强制标准尺寸: {display_width} x {display_height}")
    else:
        # 保持原始尺寸但进行适当缩放
        display_width, display_height = _calculate_optimal_size(original_width, original_height)
        print(f"   📏 优化后尺寸: {display_width} x {display_height}")
        
        # 如果尺寸没有变化，直接使用原始尺寸
        if display_width == original_width and display_height == original_height:
            print(f"   ✅ 保持原始尺寸: {display_width} x {display_height}")

    # 使用新的布局算法计算位置
    new_x, new_y = await find_next_best_element_position(
        canvas_data, 
        element_width=display_width,
        element_height=display_height,
        force_standard_size=use_standard_size
    )
    
    print(f"   📍 计算位置: ({new_x}, {new_y})")
    print(f"   📊 最终尺寸: {display_width} x {display_height}")

    return {
        "type": "image",
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
        "link": None,
        "locked": False,
        "status": "saved",
        "scale": [1, 1],
        "crop": None,
    }


async def save_image_to_canvas(session_id: str, canvas_id: str, filename: str, mime_type: str, width: int, height: int, cos_url: Optional[str] = None, user_info: Optional[Dict[str, Any]] = None) -> str:
    """Save image to canvas with proper locking and positioning"""
    try:
        print(f"💾 [SAVE_IMAGE] 开始保存图片到画布:")
        print(f"   📄 文件: {filename}")
        print(f"   🎨 画布: {canvas_id}")
        print(f"   📐 尺寸: {width}x{height}")
        print(f"   🔗 COS URL: {cos_url[:50] + '...' if cos_url and len(cos_url) > 50 else cos_url}")
        
        # 提取用户信息
        user_email = None
        user_uuid = None
        if user_info:
            user_email = user_info.get('email')
            user_uuid = user_info.get('uuid')
            print(f"👤 [SAVE_IMAGE] 用户信息: email={user_email}, uuid={user_uuid}")

        # Use lock to ensure atomicity of the save process
        async with canvas_lock_manager.lock_canvas(canvas_id):
            print(f"🔒 [SAVE_IMAGE] 获得画布锁: {canvas_id}")

            # Fetch canvas data once inside the lock with user authentication
            canvas: Optional[Dict[str, Any]] = await db_service.get_canvas_data(canvas_id, user_uuid=user_uuid, user_email=user_email)
            if canvas is None:
                canvas = {'data': {}}
                print(f"📄 [SAVE_IMAGE] 创建新画布数据")
            else:
                print(f"📄 [SAVE_IMAGE] 加载现有画布数据")

            canvas_data: Dict[str, Any] = canvas.get('data', {})

        # Ensure 'elements' and 'files' keys exist
        if 'elements' not in canvas_data:
            canvas_data['elements'] = []
        if 'files' not in canvas_data:
            canvas_data['files'] = {}

        file_id = generate_file_id()
        
        # 🎯 Canvas特殊处理：无论是否有腾讯云URL，都使用本地代理避免跨域问题
        
        # 先尝试上传到腾讯云（后台性能优化）
        cos_service = get_cos_image_service()
        uploaded_cos_url = None
        
        if not cos_url:  # 只有在没有提供现有腾讯云URL时才尝试上传
            # 构建本地文件路径
            possible_paths = [
                os.path.join(SERVER_DIR, 'user_data', 'files', filename),
                os.path.join(SERVER_DIR, 'user_data', 'users', session_id, 'files', filename)
            ]
            
            local_file_path = None
            for path in possible_paths:
                if os.path.exists(path):
                    local_file_path = path
                    print(f"📁 找到本地文件: {path}")
                    break
            
            if local_file_path and cos_service.available:
                # 尝试上传到腾讯云
                uploaded_cos_url = await cos_service.upload_image_from_file(
                    local_file_path=local_file_path,
                    image_key=filename,
                    content_type=mime_type,
                    delete_local=False  # 保留本地文件，供后续图生图使用
                )
                
                if uploaded_cos_url:
                    print(f"✅ 图片已上传到腾讯云: {filename} -> {uploaded_cos_url}")
        else:
            print(f"✅ 使用已提供的腾讯云URL: {filename} -> {cos_url}")
        
        # 🖼️ Canvas始终使用本地代理URL，避免跨域污染
        url = get_canvas_image_url(filename)
        print(f"🖼️ Canvas使用代理URL避免跨域: {filename} -> {url}")
        
        # 记录腾讯云状态供监控
        if cos_url or uploaded_cos_url:
            print(f"☁️ 腾讯云备份成功，但Canvas使用代理URL")
        else:
            print(f"📁 腾讯云不可用，Canvas使用本地URL")

        # 🎯 双URL存储策略：确保Canvas导出安全
        canvas_safe_url = get_canvas_image_url(filename)  # 始终使用本地代理，防跨域
        
        file_data: Dict[str, Any] = {
            'mimeType': mime_type,
            'id': file_id,
            'dataURL': canvas_safe_url,  # 🛡️ Canvas专用本地代理URL
            'created': int(time.time() * 1000),
        }
        
        # 如果有腾讯云URL，作为备用存储（用于性能优化场景）
        if cos_url or uploaded_cos_url:
            file_data['cloudURL'] = cos_url or uploaded_cos_url
            
        print(f"🛡️ [CANVAS_SAFE] 双URL存储:")
        print(f"   📁 Canvas URL (dataURL): {canvas_safe_url}")
        if cos_url or uploaded_cos_url:
            print(f"   ☁️ Cloud URL (cloudURL): {cos_url or uploaded_cos_url}")

        new_image_element: Dict[str, Any] = await generate_new_image_element(
            canvas_id,
            file_id,
            {
                'width': width,
                'height': height,
            },
            canvas_data
        )

        # Update the canvas data with the new element and file info
        elements_list = cast(List[Dict[str, Any]], canvas_data['elements'])
        elements_list.append(new_image_element)
        canvas_data['files'][file_id] = file_data

        # 使用腾讯云URL或本地URL
        image_url = url

        # Save the updated canvas data back to the database
        await db_service.save_canvas_data(canvas_id, json.dumps(canvas_data))

        # Broadcast image generation message to frontend
        await broadcast_session_update(session_id, canvas_id, {
            'type': 'image_generated',
            'element': new_image_element,
            'file': file_data,
            'image_url': image_url,
        })

        print(f"✅ [SAVE_IMAGE] 图片保存完成: {filename}")
        print(f"   🔗 最终URL: {image_url}")
        print(f"   📍 位置: ({new_image_element['x']}, {new_image_element['y']})")
        print(f"   📐 尺寸: {new_image_element['width']}x{new_image_element['height']}")
        
        return image_url
        
    except Exception as e:
        error_msg = f"保存图片到画布失败: {str(e)}"
        print(f"❌ [SAVE_IMAGE] {error_msg}")
        print(f"❌ [SAVE_IMAGE] 错误类型: {type(e).__name__}")
        import traceback
        print(f"❌ [SAVE_IMAGE] 错误堆栈:\n{traceback.format_exc()}")
        
        # 发送错误通知到前端
        try:
            await send_image_error_notification(session_id, error_msg)
        except Exception as notification_error:
            print(f"❌ [SAVE_IMAGE] 发送错误通知失败: {notification_error}")
        
        # 重新抛出异常供上层处理
        raise e


async def send_image_start_notification(session_id: str, message: str) -> None:
    """Send image generation start notification"""
    await send_to_websocket(session_id, {
        'type': 'image_generation_start',
        'message': message
    })


async def send_image_error_notification(session_id: str, error_message: str) -> None:
    """Send image generation error notification"""
    await send_to_websocket(session_id, {
        'type': 'error',
        'error': error_message
    })
