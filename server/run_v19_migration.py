#!/usr/bin/env python3
"""
Run v19 migration: Add views and likes to tb_sora2
"""
import sqlite3
import sys
import os

# Add server directory to path
sys.path.insert(0, os.path.dirname(__file__))

from services.db_service import DB_PATH


def check_columns_exist(db_path: str):
    """Check if views and likes columns exist"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("PRAGMA table_info(tb_sora2)")
    columns = [row[1] for row in cursor.fetchall()]

    conn.close()

    return 'views' in columns, 'likes' in columns


def add_views_likes_columns(db_path: str):
    """Add views and likes columns to tb_sora2"""
    print(f"🔍 Checking database: {db_path}")

    views_exists, likes_exists = check_columns_exist(db_path)

    print(f"   - views column exists: {views_exists}")
    print(f"   - likes column exists: {likes_exists}")

    if views_exists and likes_exists:
        print("✅ Both columns already exist, no migration needed")
        return

    print("\n🎯 Starting migration...")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        if not views_exists:
            print("  - Adding views column...")
            cursor.execute("""
                ALTER TABLE tb_sora2
                ADD COLUMN views INTEGER DEFAULT 0
            """)
            print("  ✅ views column added")

        if not likes_exists:
            print("  - Adding likes column...")
            cursor.execute("""
                ALTER TABLE tb_sora2
                ADD COLUMN likes INTEGER DEFAULT 0
            """)
            print("  ✅ likes column added")

        # Update db_version
        cursor.execute("UPDATE db_version SET version = 19")

        conn.commit()

        print("\n✅ Migration completed successfully!")
        print("   Added columns:")
        print("   - views: Video view count (default: 0)")
        print("   - likes: Video like count (default: 0)")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        raise
    finally:
        conn.close()


def main():
    """Main function"""
    print("=" * 70)
    print("Migration v19: Add views and likes to tb_sora2")
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
    add_views_likes_columns(db_path)

    print("\n" + "=" * 70)
    print("Migration completed")
    print("=" * 70)


if __name__ == "__main__":
    main()
