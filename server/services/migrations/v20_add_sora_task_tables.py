from . import Migration
import sqlite3


class V20AddSoraTaskTables(Migration):
    version = 20
    description = "Add tb_sora_task and tb_sora_server tables for distributed task processing"

    def up(self, conn: sqlite3.Connection) -> None:
        """Create tb_sora_task and tb_sora_server tables"""

        print("🎯 Creating tb_sora_task and tb_sora_server tables...")

        # Create tb_sora_server table
        print("  - Creating tb_sora_server table...")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tb_sora_server (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip TEXT NOT NULL UNIQUE,
                total_tasks INTEGER DEFAULT 0,
                status INTEGER DEFAULT 0,
                ctime TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
                mtime TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
        """)
        print("  ✅ tb_sora_server table created")

        # Create tb_sora_task table
        print("  - Creating tb_sora_task table...")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tb_sora_task (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id INTEGER NOT NULL,
                user_uuid TEXT NOT NULL,
                status TEXT DEFAULT 'waiting',
                video_url TEXT DEFAULT '',
                server_ip TEXT DEFAULT '',
                ctime TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
                mtime TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
                FOREIGN KEY (video_id) REFERENCES tb_sora2(id) ON DELETE CASCADE
            )
        """)
        print("  ✅ tb_sora_task table created")

        # Create indexes for better query performance
        print("  - Creating indexes...")
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_sora_task_status
            ON tb_sora_task(status)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_sora_task_video_id
            ON tb_sora_task(video_id)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_sora_server_status
            ON tb_sora_server(status)
        """)
        print("  ✅ Indexes created")

        print("✅ Migration v20 completed successfully")
        print("   Created tables:")
        print("   - tb_sora_server: Server registry for distributed task processing")
        print("     * ip: Server IP address (unique)")
        print("     * total_tasks: Current number of tasks assigned to server")
        print("     * status: Server status (0=active, 1=inactive)")
        print("   - tb_sora_task: Task queue for video generation")
        print("     * video_id: Reference to tb_sora2.id")
        print("     * user_uuid: User identifier")
        print("     * status: Task status (waiting/running/success/failed)")
        print("     * video_url: Generated video URL")
        print("     * server_ip: IP of server processing this task")

    def down(self, conn: sqlite3.Connection) -> None:
        """Drop tb_sora_task and tb_sora_server tables"""
        print("⚠️ Rolling back v20: Dropping tables...")

        conn.execute("DROP TABLE IF EXISTS tb_sora_task")
        print("  - Dropped tb_sora_task")

        conn.execute("DROP TABLE IF EXISTS tb_sora_server")
        print("  - Dropped tb_sora_server")

        print("✅ Migration v20 rolled back")
