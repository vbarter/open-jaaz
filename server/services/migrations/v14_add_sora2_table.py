from . import Migration
import sqlite3


class V14AddSora2Table(Migration):
    version = 14
    description = "Create tb_sora2 table for storing Sora2 video generation records"

    def up(self, conn: sqlite3.Connection) -> None:
        """Create tb_sora2 table"""

        print("🎯 Creating tb_sora2 table...")

        # 创建 tb_sora2 表
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tb_sora2 (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_uuid TEXT NOT NULL,
                prompt TEXT NOT NULL,
                model TEXT DEFAULT 'sora2',
                images TEXT DEFAULT '',
                video_url TEXT DEFAULT '',
                status TEXT DEFAULT 'running',
                remark TEXT DEFAULT '',
                ctime TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
                mtime TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
        """)

        # 创建索引以提高查询性能
        print("  - Creating indexes...")

        # 用户 UUID 索引
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tb_sora2_user_uuid
            ON tb_sora2(user_uuid)
        """)

        # 状态索引
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tb_sora2_status
            ON tb_sora2(status)
        """)

        # 创建时间索引
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tb_sora2_ctime
            ON tb_sora2(ctime DESC)
        """)

        # 复合索引：用户 + 状态
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tb_sora2_user_status
            ON tb_sora2(user_uuid, status)
        """)

        print("✅ tb_sora2 table created successfully")
        print("   Table structure:")
        print("   - id: Auto-increment primary key")
        print("   - user_uuid: User UUID (indexed)")
        print("   - prompt: Video generation prompt")
        print("   - model: Video generation model (default: sora2)")
        print("   - images: Reference images (JSON array, default: empty)")
        print("   - video_url: Generated video URL")
        print("   - status: Generation status (success/failed/running)")
        print("   - remark: Additional notes")
        print("   - ctime: Creation time (auto-generated)")
        print("   - mtime: Last modification time (auto-generated)")

    def down(self, conn: sqlite3.Connection) -> None:
        """Remove tb_sora2 table"""
        print("⚠️ Dropping tb_sora2 table...")
        conn.execute("DROP TABLE IF EXISTS tb_sora2")
        print("✅ tb_sora2 table dropped")
