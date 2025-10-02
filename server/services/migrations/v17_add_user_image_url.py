from . import Migration
import sqlite3


class V17AddUserImageUrl(Migration):
    version = 17
    description = "Add image_url column to tb_user table for storing Google OAuth profile picture"

    def up(self, conn: sqlite3.Connection) -> None:
        """Add image_url column to tb_user table"""

        print("🎯 Adding image_url column to tb_user table...")

        # Check if image_url column already exists
        cursor = conn.execute("PRAGMA table_info(tb_user)")
        columns = [column[1] for column in cursor.fetchall()]

        if 'image_url' not in columns:
            # Add image_url column to tb_user table
            conn.execute("""
                ALTER TABLE tb_user
                ADD COLUMN image_url TEXT DEFAULT ''
            """)

            print("✅ Added image_url column to tb_user table")
            print("   - image_url: TEXT (default: '')")
        else:
            print("⚠️ image_url column already exists in tb_user table")

    def down(self, conn: sqlite3.Connection) -> None:
        """Remove image_url column from tb_user table"""
        print("⚠️ Removing image_url column from tb_user table...")
        print("   Note: SQLite doesn't support DROP COLUMN, column will remain in table")
        print("   You can manually recreate the table if needed")
