"""
数据库迁移 v15: 添加 tb_sora2_share 分享表
"""
import sqlite3
from services.migrations import Migration


class V15AddSora2ShareTable(Migration):
    version = 15
    description = "添加 tb_sora2_share 分享表"

    def up(self, conn: sqlite3.Connection) -> None:
        """执行数据库迁移"""
        cursor = conn.cursor()

        # 创建 tb_sora2_share 表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tb_sora2_share (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id INTEGER NOT NULL,
                user_uuid TEXT NOT NULL,
                share_id TEXT NOT NULL UNIQUE,
                share_url TEXT NOT NULL,
                views INTEGER DEFAULT 0,
                likes INTEGER DEFAULT 0,
                ctime TEXT NOT NULL,
                mtime TEXT NOT NULL,
                FOREIGN KEY (video_id) REFERENCES tb_sora2(id) ON DELETE CASCADE
            )
        """)

        # 创建索引
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sora2_share_share_id
            ON tb_sora2_share(share_id)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sora2_share_video_id
            ON tb_sora2_share(video_id)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sora2_share_user_uuid
            ON tb_sora2_share(user_uuid)
        """)

        conn.commit()
        print("✅ 成功创建 tb_sora2_share 表")

    def down(self, conn: sqlite3.Connection) -> None:
        """回滚迁移"""
        cursor = conn.cursor()
        cursor.execute("DROP TABLE IF EXISTS tb_sora2_share")
        conn.commit()
        print("✅ 成功删除 tb_sora2_share 表")
