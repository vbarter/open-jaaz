"""
消息媒体管理器 - 处理消息中的多媒体内容
支持一条消息包含多个图片和视频
"""
import json
import time
import uuid
from typing import Dict, Any, List, Optional
from log import get_logger

logger = get_logger(__name__)


class MessageMediaManager:
    """管理消息中的多媒体内容"""

    @staticmethod
    def create_media_message(
        role: str = 'assistant',
        content: str = '',
        media_type: Optional[str] = None,
        media_url: Optional[str] = None,
        media_metadata: Optional[Dict] = None,
        existing_message: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        创建或更新包含媒体内容的消息

        Args:
            role: 消息角色
            content: 文本内容
            media_type: 媒体类型 ('image' | 'video')
            media_url: 媒体URL
            media_metadata: 媒体元数据
            existing_message: 现有消息（用于追加媒体）

        Returns:
            包含媒体内容的消息对象
        """
        # 如果有现有消息，基于它创建
        if existing_message:
            message = existing_message.copy()
            # 确保有media字段
            if 'media' not in message:
                message['media'] = {}
        else:
            # 创建新消息
            message = {
                'role': role,
                'content': content,
                'media': {},
                'timestamp': int(time.time() * 1000),
                'message_id': f"msg_{int(time.time() * 1000)}_{str(uuid.uuid4())[:8]}"
            }

        # 添加新的媒体内容
        if media_type and media_url:
            media_item = {
                'url': media_url,
                'id': f"{media_type[:3]}_{str(uuid.uuid4())[:8]}",
                'timestamp': int(time.time() * 1000)
            }

            if media_metadata:
                media_item['metadata'] = media_metadata

            # 根据类型添加到对应的数组
            if media_type == 'image':
                if 'images' not in message['media']:
                    message['media']['images'] = []
                message['media']['images'].append(media_item)
                logger.info(f"📸 Added image to message: {media_url}")

            elif media_type == 'video':
                if 'videos' not in message['media']:
                    message['media']['videos'] = []
                message['media']['videos'].append(media_item)
                logger.info(f"🎥 Added video to message: {media_url}")

        # 保持向后兼容性 - 添加type和url字段
        if media_type and media_url:
            message['type'] = media_type
            if media_type == 'video':
                message['video_url'] = media_url
            elif media_type == 'image':
                message['image_url'] = media_url

        return message

    @staticmethod
    def merge_media_content(
        base_message: Dict[str, Any],
        new_media_type: str,
        new_media_url: str,
        new_media_metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        合并媒体内容到现有消息

        Args:
            base_message: 基础消息
            new_media_type: 新媒体类型
            new_media_url: 新媒体URL
            new_media_metadata: 新媒体元数据

        Returns:
            合并后的消息
        """
        return MessageMediaManager.create_media_message(
            role=base_message.get('role', 'assistant'),
            content=base_message.get('content', ''),
            media_type=new_media_type,
            media_url=new_media_url,
            media_metadata=new_media_metadata,
            existing_message=base_message
        )

    @staticmethod
    def extract_media_from_message(message: Dict[str, Any]) -> Dict[str, List]:
        """
        从消息中提取所有媒体内容

        Args:
            message: 消息对象

        Returns:
            包含images和videos列表的字典
        """
        media = message.get('media', {})
        result = {
            'images': media.get('images', []),
            'videos': media.get('videos', [])
        }

        # 向后兼容：检查旧格式
        if message.get('type') == 'video' and message.get('video_url'):
            if not any(v['url'] == message['video_url'] for v in result['videos']):
                result['videos'].append({
                    'url': message['video_url'],
                    'id': f"vid_{str(uuid.uuid4())[:8]}",
                    'timestamp': message.get('timestamp', int(time.time() * 1000))
                })
        elif message.get('type') == 'image' and message.get('image_url'):
            if not any(img['url'] == message['image_url'] for img in result['images']):
                result['images'].append({
                    'url': message['image_url'],
                    'id': f"img_{str(uuid.uuid4())[:8]}",
                    'timestamp': message.get('timestamp', int(time.time() * 1000))
                })

        return result

    @staticmethod
    def format_message_for_display(message: Dict[str, Any]) -> str:
        """
        格式化消息用于显示

        Args:
            message: 消息对象

        Returns:
            格式化的消息文本
        """
        content = message.get('content', '')
        media = MessageMediaManager.extract_media_from_message(message)

        # 添加图片标记
        for img in media['images']:
            if img['url'] not in content:
                content += f"\n![image]({img['url']})"

        # 添加视频标记
        for video in media['videos']:
            if video['url'] not in content:
                content += f"\n🎬 [Video]({video['url']})"

        return content.strip()