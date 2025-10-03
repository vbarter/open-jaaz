#!/usr/bin/env python3
"""
Run v20 migration: Add tb_sora_task and tb_sora_server tables
"""
import sqlite3
import sys
import os

# Add server directory to path
sys.path.insert(0, os.path.dirname(__file__))

from services.db_service import DB_PATH


def check_tables_exist(db_path: str):
    """Check if tb_sora_task and tb_sora_server tables exist"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name IN ('tb_sora_task', 'tb_sora_server')
    """)
    tables = [row[0] for row in cursor.fetchall()]

    conn.close()

    return 'tb_sora_task' in tables, 'tb_sora_server' in tables


def create_tables(db_path: str):
    """Create tb_sora_task and tb_sora_server tables"""
    print(f"🔍 Checking database: {db_path}")

    task_exists, server_exists = check_tables_exist(db_path)

    print(f"   - tb_sora_task table exists: {task_exists}")
    print(f"   - tb_sora_server table exists: {server_exists}")

    if task_exists and server_exists:
        print("✅ Both tables already exist, no migration needed")
        return

    print("\n🎯 Starting migration...")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        if not server_exists:
            print("  - Creating tb_sora_server table...")
            cursor.execute("""
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

        if not task_exists:
            print("  - Creating tb_sora_task table...")
            cursor.execute("""
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

        # Create indexes
        print("  - Creating indexes...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sora_task_status
            ON tb_sora_task(status)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sora_task_video_id
            ON tb_sora_task(video_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sora_server_status
            ON tb_sora_server(status)
        """)
        print("  ✅ Indexes created")

        # Update db_version
        cursor.execute("UPDATE db_version SET version = 20")

        conn.commit()

        print("\n✅ Migration completed successfully!")
        print("   Created tables:")
        print("   - tb_sora_server: Server registry for distributed task processing")
        print("   - tb_sora_task: Task queue for video generation")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        raise
    finally:
        conn.close()


def main():
    """Main function"""
    print("=" * 70)
    print("Migration v20: Add tb_sora_task and tb_sora_server tables")
    print("=" * 70)

    # Get DB path
    db_path = DB_PATH

    if len(sys.argv) > 1:
        db_path = sys.argv[1]

    print(f"\nDatabase: {db_path}\n")

    # Check if database exists
    if not os.path.exists(db_path):
        print(f"❌ Database not found: {db_path}")
        sys.exit(1)

    # Run migration
    create_tables(db_path)

    print("\n" + "=" * 70)
    print("Migration completed")
    print("=" * 70)


if __name__ == "__main__":
    main()
