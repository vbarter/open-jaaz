"""
Migration 019: Create tb_sora_feedback table for video interactions
"""
import sqlite3
from datetime import datetime

def migrate(db_path: str):
    """Create tb_sora_feedback table"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Create tb_sora_feedback table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tb_sora_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id INTEGER NOT NULL,
                user_uuid TEXT NOT NULL,
                is_liked INTEGER DEFAULT 0,
                ctime TEXT NOT NULL,
                mtime TEXT NOT NULL,
                UNIQUE(video_id, user_uuid),
                FOREIGN KEY (video_id) REFERENCES tb_sora2(id) ON DELETE CASCADE
            )
        """)

        # Create indexes for performance
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sora_feedback_video_id
            ON tb_sora_feedback(video_id)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sora_feedback_user_uuid
            ON tb_sora_feedback(user_uuid)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sora_feedback_is_liked
            ON tb_sora_feedback(is_liked)
        """)

        conn.commit()
        print("✅ Migration 019: tb_sora_feedback table created successfully")

    except Exception as e:
        conn.rollback()
        print(f"❌ Migration 019 failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        db_path = sys.argv[1]
    else:
        db_path = "user_data/localmanus.db"

    migrate(db_path)
