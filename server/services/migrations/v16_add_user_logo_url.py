from . import Migration
import sqlite3


class V16AddUserLogoUrl(Migration):
    version = 16
    description = "Add logo_url column to tb_user table for storing user avatar"

    def up(self, conn: sqlite3.Connection) -> None:
        """Add logo_url column to tb_user table"""

        print("🎯 Adding logo_url column to tb_user table...")

        # Check if logo_url column already exists
        cursor = conn.execute("PRAGMA table_info(tb_user)")
        columns = [column[1] for column in cursor.fetchall()]

        if 'logo_url' not in columns:
            # Add logo_url column to tb_user table
            conn.execute("""
                ALTER TABLE tb_user
                ADD COLUMN logo_url TEXT DEFAULT ''
            """)

            print("✅ Added logo_url column to tb_user table")
            print("   - logo_url: TEXT (default: '')")
        else:
            print("⚠️ logo_url column already exists in tb_user table")

    def down(self, conn: sqlite3.Connection) -> None:
        """Remove logo_url column from tb_user table"""
        print("⚠️ Removing logo_url column from tb_user table...")
        print("   Note: SQLite doesn't support DROP COLUMN, column will remain in table")
        print("   You can manually recreate the table if needed")
