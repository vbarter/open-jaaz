"""
Sora2 分享服务
"""
import hashlib
from datetime import datetime
from typing import Optional, Dict, Any
from services.db_service import DB_PATH
from services.db_runtime import aiosqlite_compat as aiosqlite
from log import get_logger

logger = get_logger(__name__)


class Sora2ShareService:
    def __init__(self):
        self.db_path = DB_PATH

    def generate_share_id(self, user_uuid: str, video_id: int) -> str:
        """生成分享ID（基于user_uuid + video_id的签名）"""
        # 使用MD5生成短签名
        content = f"{user_uuid}:{video_id}"
        return hashlib.md5(content.encode()).hexdigest()[:16]

    async def create_share(self, user_uuid: str, video_id: int, base_url: str) -> Dict[str, Any]:
        """
        创建或获取分享记录

        Args:
            user_uuid: 用户UUID
            video_id: 视频ID
            base_url: 网站基础URL（如：http://127.0.0.1:8000）

        Returns:
            分享记录字典
        """
        # 生成分享ID
        share_id = self.generate_share_id(user_uuid, video_id)
        share_url = f"{base_url}/share?id={share_id}"

        # 检查是否已存在
        existing = await self.get_share_by_id(share_id)
        if existing:
            logger.info(f"分享记录已存在: share_id={share_id}")
            return existing

        # 创建新记录
        now = datetime.utcnow().isoformat() + 'Z'

        async with aiosqlite.connect(self.db_path) as conn:
            cursor = await conn.execute(
                """
                INSERT INTO tb_sora2_share
                (video_id, user_uuid, share_id, share_url, views, likes, ctime, mtime)
                VALUES (?, ?, ?, ?, 0, 0, ?, ?)
                """,
                (video_id, user_uuid, share_id, share_url, now, now)
            )
            await conn.commit()

            share_record_id = cursor.lastrowid

        logger.info(f"创建分享记录: id={share_record_id}, share_id={share_id}")

        return {
            "id": share_record_id,
            "video_id": video_id,
            "user_uuid": user_uuid,
            "share_id": share_id,
            "share_url": share_url,
            "views": 0,
            "likes": 0,
            "ctime": now,
            "mtime": now,
        }

    async def get_share_by_id(self, share_id: str) -> Optional[Dict[str, Any]]:
        """根据share_id获取分享记录"""
        async with aiosqlite.connect(self.db_path) as conn:
            cursor = await conn.execute(
                """
                SELECT id, video_id, user_uuid, share_id, share_url,
                       views, likes, ctime, mtime
                FROM tb_sora2_share
                WHERE share_id = ?
                """,
                (share_id,)
            )
            row = await cursor.fetchone()

        if not row:
            return None

        return {
            "id": row[0],
            "video_id": row[1],
            "user_uuid": row[2],
            "share_id": row[3],
            "share_url": row[4],
            "views": row[5],
            "likes": row[6],
            "ctime": row[7],
            "mtime": row[8],
        }

    async def increment_views(self, share_id: str) -> bool:
        """
        增加访问量（更新 tb_sora2 表）

        策略: 每次刷新页面，tb_sora2.views +1（只增不减）
        """
        now = datetime.utcnow().isoformat() + 'Z'

        async with aiosqlite.connect(self.db_path) as conn:
            # 先获取 video_id
            cursor = await conn.execute(
                "SELECT video_id FROM tb_sora2_share WHERE share_id = ?",
                (share_id,)
            )
            row = await cursor.fetchone()

            if not row:
                return False

            video_id = row[0]

            # 更新 tb_sora2 表的 views 字段
            cursor = await conn.execute(
                """
                UPDATE tb_sora2
                SET views = COALESCE(views, 0) + 1, mtime = ?
                WHERE id = ?
                """,
                (now, video_id)
            )
            await conn.commit()

        success = cursor.rowcount > 0
        if success:
            logger.info(f"✅ 增加访问量: share_id={share_id}, video_id={video_id}")

        return success

    async def increment_likes(self, share_id: str) -> bool:
        """增加点赞量"""
        now = datetime.utcnow().isoformat() + 'Z'

        async with aiosqlite.connect(self.db_path) as conn:
            cursor = await conn.execute(
                """
                UPDATE tb_sora2_share
                SET likes = likes + 1, mtime = ?
                WHERE share_id = ?
                """,
                (now, share_id)
            )
            await conn.commit()

        success = cursor.rowcount > 0
        if success:
            logger.info(f"增加点赞量: share_id={share_id}")

        return success

    async def get_video_by_share_id(self, share_id: str) -> Optional[Dict[str, Any]]:
        """
        根据share_id获取视频信息

        注意: views 和 likes 从 tb_sora2 表读取（实时统计数据）
        """
        async with aiosqlite.connect(self.db_path) as conn:
            cursor = await conn.execute(
                """
                SELECT s.id as sora2_id, s.user_uuid, s.prompt, s.model,
                       s.images, s.video_url, s.status, s.remark, s.ctime, s.mtime,
                       COALESCE(s.views, 0) as views,
                       COALESCE(s.likes, 0) as likes,
                       u.image_url as user_image_url
                FROM tb_sora2 s
                INNER JOIN tb_sora2_share sh ON s.id = sh.video_id
                LEFT JOIN tb_user u ON s.user_uuid = u.uuid
                WHERE sh.share_id = ?
                """,
                (share_id,)
            )
            row = await cursor.fetchone()

        if not row:
            return None

        return {
            "id": row[0],
            "user_uuid": row[1],
            "prompt": row[2],
            "model": row[3],
            "images": row[4],
            "video_url": row[5],
            "status": row[6],
            "remark": row[7],
            "ctime": row[8],
            "mtime": row[9],
            "views": row[10],
            "likes": row[11],
            "user_image_url": row[12],
        }


# 全局实例
sora2_share_service: Optional[Sora2ShareService] = None


def get_sora2_share_service() -> Sora2ShareService:
    """获取Sora2分享服务实例"""
    global sora2_share_service
    if sora2_share_service is None:
        sora2_share_service = Sora2ShareService()
    return sora2_share_service
