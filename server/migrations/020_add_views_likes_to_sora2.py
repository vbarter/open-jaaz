"""
Migration 020: Add views and likes columns to tb_sora2 table
"""
import sqlite3

def migrate(db_path: str):
    """Add views and likes columns to tb_sora2"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Add views column
        cursor.execute("""
            ALTER TABLE tb_sora2
            ADD COLUMN views INTEGER DEFAULT 0
        """)

        # Add likes column
        cursor.execute("""
            ALTER TABLE tb_sora2
            ADD COLUMN likes INTEGER DEFAULT 0
        """)

        conn.commit()
        print("✅ Migration 020: Added views and likes columns to tb_sora2")

    except Exception as e:
        conn.rollback()
        print(f"❌ Migration 020 failed: {e}")
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
