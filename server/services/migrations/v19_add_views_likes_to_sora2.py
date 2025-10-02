from . import Migration
import sqlite3


class V19AddViewsLikesToSora2(Migration):
    version = 19
    description = "Add views and likes columns to tb_sora2 table"

    def up(self, conn: sqlite3.Connection) -> None:
        """Add views and likes columns to tb_sora2"""

        print("🎯 Adding views and likes columns to tb_sora2...")

        # Check if columns already exist
        cursor = conn.execute("PRAGMA table_info(tb_sora2)")
        columns = [row[1] for row in cursor.fetchall()]

        if 'views' not in columns:
            print("  - Adding views column...")
            conn.execute("""
                ALTER TABLE tb_sora2
                ADD COLUMN views INTEGER DEFAULT 0
            """)
            print("  ✅ views column added")
        else:
            print("  ⏭️ views column already exists")

        if 'likes' not in columns:
            print("  - Adding likes column...")
            conn.execute("""
                ALTER TABLE tb_sora2
                ADD COLUMN likes INTEGER DEFAULT 0
            """)
            print("  ✅ likes column added")
        else:
            print("  ⏭️ likes column already exists")

        print("✅ Migration v19 completed successfully")
        print("   Added columns:")
        print("   - views: Video view count (default: 0)")
        print("   - likes: Video like count (default: 0)")

    def down(self, conn: sqlite3.Connection) -> None:
        """Remove views and likes columns from tb_sora2"""
        print("⚠️ Rolling back v19: Cannot drop columns in SQLite")
        print("   SQLite does not support DROP COLUMN directly")
        print("   Migration rollback skipped")
