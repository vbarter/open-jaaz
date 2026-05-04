"""
对象存储图片上传服务。

兼容旧的 `CosImageService` 命名，底层优先使用 Cloudflare R2，
未配置时回退到腾讯 COS，再回退本地文件。
"""

import os
import aiofiles
from typing import Optional
from utils.object_storage import get_object_storage_service
from log import get_logger

logger = get_logger(__name__)


class CosImageService:
    """对象存储图片上传服务（兼容旧命名）"""
    
    def __init__(self):
        """初始化对象存储服务"""
        self.storage_service = None
        self.available = False
        self.provider = "local"
        
        try:
            self.storage_service = get_object_storage_service()
            self.available = self.storage_service.available
            self.provider = self.storage_service.provider
            if self.available:
                logger.info(f"✅ 对象存储服务初始化成功: provider={self.provider}")
            else:
                logger.warning("⚠️ 对象存储未配置，将使用本地存储")
        except Exception as e:
            logger.warning(f"⚠️ 对象存储初始化失败，将使用本地存储: {e}")
            self.available = False
            self.provider = "local"
    
    async def upload_image_from_file(self, local_file_path: str, image_key: str, content_type: str = 'image/png', delete_local: bool = True) -> Optional[str]:
        """
        从本地文件上传图片到对象存储
        
        Args:
            local_file_path: 本地文件路径
            image_key: 对象存储的key（文件名）
            content_type: 文件类型，默认image/png
            delete_local: 是否删除本地文件，默认True
        
        Returns:
            成功返回对象存储URL，失败返回None
        """
        if not self.available:
            logger.debug("对象存储不可用，跳过上传")
            return None
            
        try:
            # 检查本地文件是否存在
            if not os.path.exists(local_file_path):
                logger.error(f"❌ 本地文件不存在: {local_file_path}")
                return None
            
            # 读取文件内容
            async with aiofiles.open(local_file_path, 'rb') as file:
                image_bytes = await file.read()
            
            cloud_url = self.storage_service.upload_bytes(
                data=image_bytes,
                key=image_key,
                content_type=content_type,
            ) if self.storage_service else None
            
            if cloud_url:
                logger.info(f"✅ 图片上传成功: {image_key} -> {cloud_url}")
                
                # 删除本地临时文件
                if delete_local:
                    try:
                        os.remove(local_file_path)
                        logger.info(f"🗑️ 本地临时文件已删除: {local_file_path}")
                    except Exception as e:
                        logger.warning(f"⚠️ 删除本地文件失败: {local_file_path}, 错误: {e}")
                
                return cloud_url
            else:
                logger.error(f"❌ 图片上传失败: {image_key}")
                return None
                
        except Exception as e:
            logger.error(f"❌ 上传图片到对象存储失败: {e}")
            return None
    
    async def upload_image_from_bytes(self, image_bytes: bytes, image_key: str, content_type: str = 'image/png') -> Optional[str]:
        """
        从字节数据上传图片到对象存储
        
        Args:
            image_bytes: 图片字节数据
            image_key: 对象存储的key（文件名）
            content_type: 文件类型，默认image/png
        
        Returns:
            成功返回对象存储URL，失败返回None
        """
        if not self.available:
            logger.debug("对象存储不可用，跳过上传")
            return None
            
        try:
            cloud_url = self.storage_service.upload_bytes(
                data=image_bytes,
                key=image_key,
                content_type=content_type,
            ) if self.storage_service else None
            
            if cloud_url:
                logger.info(f"✅ 图片字节数据上传成功: {image_key} -> {cloud_url}")
                return cloud_url
            else:
                logger.error(f"❌ 图片字节数据上传失败: {image_key}")
                return None
                
        except Exception as e:
            logger.error(f"❌ 上传图片字节数据到对象存储失败: {e}")
            return None
    
    def get_image_url(self, image_key: str) -> Optional[str]:
        """
        获取图片的对象存储访问URL
        
        Args:
            image_key: 图片在对象存储中的key（文件名）
        
        Returns:
            图片访问URL
        """
        if not self.available:
            logger.debug("对象存储不可用，返回None")
            return None
            
        try:
            url = self.storage_service.get_file_url(image_key) if self.storage_service else None
            logger.debug(f"📸 获取图片URL: {image_key} -> {url}")
            return url
        except Exception as e:
            logger.error(f"❌ 获取图片URL失败: {image_key}, 错误: {e}")
            return None
    
    def extract_key_from_filename(self, filename: str) -> str:
        """
        从文件名中提取对象存储key
        根据用户需求，key就是文件名本身
        
        Args:
            filename: 文件名，如 "im_9bUhMvsX.png"
        
        Returns:
            对象存储的key，如 "im_9bUhMvsX.png"
        """
        return filename


# 全局实例
cos_image_service = None

def get_cos_image_service() -> CosImageService:
    """获取腾讯云图片服务实例"""
    global cos_image_service
    if cos_image_service is None:
        cos_image_service = CosImageService()
    return cos_image_service
