"""
Sora任务分发服务
处理 tb_sora_task 和 tb_sora_server 表的数据库操作
用于分布式视频生成任务管理
"""
import sqlite3
from typing import List, Dict, Any, Optional
from log import get_logger
from services.db_service import DB_PATH
from services.db_runtime import aiosqlite_compat as aiosqlite

logger = get_logger(__name__)


class SoraTaskService:
    """Sora任务分发管理服务"""

    def __init__(self):
        self.db_path = DB_PATH

    # ==================== 服务器管理 ====================

    async def get_server_by_ip(self, ip: str) -> Optional[Dict[str, Any]]:
        """
        根据IP获取服务器信息

        Args:
            ip: 服务器IP地址

        Returns:
            Dict: 服务器信息，如果不存在返回 None
        """
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            cursor = await db.execute(
                "SELECT id, ip, total_tasks, status, ctime, mtime FROM tb_sora_server WHERE ip = ?",
                (ip,)
            )
            row = await cursor.fetchone()

            if row:
                return dict(row)
            return None

    async def create_server(self, ip: str) -> int:
        """
        手动创建服务器记录（管理员操作）

        Args:
            ip: 服务器IP地址

        Returns:
            int: 服务器ID

        Raises:
            ValueError: 如果服务器已存在
        """
        async with aiosqlite.connect(self.db_path) as db:
            # 检查是否已存在
            cursor = await db.execute(
                "SELECT id FROM tb_sora_server WHERE ip = ?",
                (ip,)
            )
            row = await cursor.fetchone()

            if row:
                raise ValueError(f"Server {ip} already exists (ID: {row[0]})")

            # 创建新服务器记录
            cursor = await db.execute(
                "INSERT INTO tb_sora_server (ip) VALUES (?)",
                (ip,)
            )
            await db.commit()
            server_id = cursor.lastrowid if cursor.lastrowid else 0
            logger.info(f"✅ New server created: {ip} (ID: {server_id})")
            return server_id

    async def get_available_server(self) -> Optional[Dict[str, Any]]:
        """
        获取一个可用的服务器（status=0）

        Returns:
            Dict: 服务器信息，如果没有可用服务器返回 None
        """
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            cursor = await db.execute(
                """
                SELECT id, ip, total_tasks, status, ctime, mtime
                FROM tb_sora_server
                WHERE status = 0
                ORDER BY total_tasks ASC, id ASC
                LIMIT 1
                """,
            )
            row = await cursor.fetchone()

            if row:
                return dict(row)
            return None

    async def increment_server_tasks(self, server_ip: str) -> bool:
        """
        增加服务器的任务计数

        Args:
            server_ip: 服务器IP

        Returns:
            bool: 更新是否成功
        """
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                UPDATE tb_sora_server
                SET total_tasks = total_tasks + 1,
                    mtime = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE ip = ?
                """,
                (server_ip,)
            )
            await db.commit()
            return True

    async def decrement_server_tasks(self, server_ip: str) -> bool:
        """
        减少服务器的任务计数

        Args:
            server_ip: 服务器IP

        Returns:
            bool: 更新是否成功
        """
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                UPDATE tb_sora_server
                SET total_tasks = MAX(0, total_tasks - 1),
                    mtime = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE ip = ?
                """,
                (server_ip,)
            )
            await db.commit()
            return True

    async def set_server_busy(self, server_ip: str) -> bool:
        """
        设置服务器为忙碌状态 (status=1)

        Args:
            server_ip: 服务器IP

        Returns:
            bool: 更新是否成功
        """
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                UPDATE tb_sora_server
                SET status = 1,
                    mtime = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE ip = ?
                """,
                (server_ip,)
            )
            await db.commit()
            logger.info(f"🔴 Server {server_ip} set to busy (status=1)")
            return True

    async def set_server_idle(self, server_ip: str) -> bool:
        """
        设置服务器为空闲状态 (status=0)

        Args:
            server_ip: 服务器IP

        Returns:
            bool: 更新是否成功
        """
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                UPDATE tb_sora_server
                SET status = 0,
                    mtime = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE ip = ?
                """,
                (server_ip,)
            )
            await db.commit()
            logger.info(f"🟢 Server {server_ip} set to idle (status=0)")
            return True

    # ==================== 任务管理 ====================

    async def create_task(
        self,
        video_id: int,
        user_uuid: str,
        status: str = "waiting"
    ) -> int:
        """
        创建新的任务记录

        Args:
            video_id: 对应 tb_sora2 表中的记录ID
            user_uuid: 用户UUID
            status: 任务状态（默认 waiting）

        Returns:
            int: 新创建任务的ID
        """
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                """
                INSERT INTO tb_sora_task (video_id, user_uuid, status)
                VALUES (?, ?, ?)
                """,
                (video_id, user_uuid, status)
            )
            await db.commit()
            task_id = cursor.lastrowid if cursor.lastrowid else 0

            logger.info(f"✅ Created task #{task_id} for video #{video_id}")
            return task_id

    async def get_waiting_task(self) -> Optional[Dict[str, Any]]:
        """
        获取一个等待中的任务

        Returns:
            Dict: 任务信息，如果没有等待任务返回 None
        """
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            cursor = await db.execute(
                """
                SELECT t.id, t.video_id, t.user_uuid, t.status, t.video_url, t.server_ip,
                       t.ctime, t.mtime, s.prompt
                FROM tb_sora_task t
                JOIN tb_sora2 s ON t.video_id = s.id
                WHERE t.status = 'waiting'
                ORDER BY t.ctime ASC
                LIMIT 1
                """,
            )
            row = await cursor.fetchone()

            if row:
                return dict(row)
            return None

    async def update_task_status(
        self,
        task_id: int,
        status: str,
        server_ip: Optional[str] = None,
        video_url: Optional[str] = None
    ) -> bool:
        """
        更新任务状态

        Args:
            task_id: 任务ID
            status: 新状态
            server_ip: 服务器IP（可选）
            video_url: 视频URL（可选）

        Returns:
            bool: 更新是否成功
        """
        updates = ["status = ?", "mtime = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')"]
        params: List[Any] = [status]

        if server_ip is not None:
            updates.append("server_ip = ?")
            params.append(server_ip)

        if video_url is not None:
            updates.append("video_url = ?")
            params.append(video_url)

        params.append(task_id)

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                f"""
                UPDATE tb_sora_task
                SET {', '.join(updates)}
                WHERE id = ?
                """,
                params
            )
            await db.commit()

            logger.info(f"✅ Updated task #{task_id}: status={status}")
            return True

    async def get_task_by_id(self, task_id: int) -> Optional[Dict[str, Any]]:
        """
        根据ID获取任务信息

        Args:
            task_id: 任务ID

        Returns:
            Dict: 任务信息，如果不存在返回 None
        """
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            cursor = await db.execute(
                """
                SELECT t.id, t.video_id, t.user_uuid, t.status, t.video_url, t.server_ip,
                       t.ctime, t.mtime, s.prompt
                FROM tb_sora_task t
                LEFT JOIN tb_sora2 s ON t.video_id = s.id
                WHERE t.id = ?
                """,
                (task_id,)
            )
            row = await cursor.fetchone()

            if row:
                return dict(row)
            return None

    async def get_tasks_by_server(self, server_ip: str) -> List[Dict[str, Any]]:
        """
        获取某个服务器的所有running状态任务

        Args:
            server_ip: 服务器IP

        Returns:
            List[Dict]: 任务列表
        """
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            cursor = await db.execute(
                """
                SELECT id, video_id, user_uuid, status, video_url, server_ip, ctime, mtime
                FROM tb_sora_task
                WHERE server_ip = ? AND status = 'running'
                ORDER BY ctime ASC
                """,
                (server_ip,)
            )
            rows = await cursor.fetchall()

            return [dict(row) for row in rows]


# 单例实例
sora_task_service = SoraTaskService()
