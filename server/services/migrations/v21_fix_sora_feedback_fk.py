"""
Migration v21: Fix tb_sora_feedback foreign key constraint

Problem:
  - Wrong: FOREIGN KEY (video_id) REFERENCES tb_sora2_tasks(id)
  - Correct: FOREIGN KEY (video_id) REFERENCES tb_sora2(id)

Solution:
  - Backup existing data
  - Drop old table
  - Recreate table with correct foreign key
  - Restore data
"""
from services.migrations import Migration
import sqlite3
from log import get_logger

logger = get_logger(__name__)


class V21FixSoraFeedbackFk(Migration):
    version = 21
    description = "Fix tb_sora_feedback foreign key constraint"

    def up(self, conn: sqlite3.Connection):
        """Apply migration"""
        cursor = conn.cursor()

        logger.info("🔧 开始修复 tb_sora_feedback 表...")

        # 1. 检查表是否存在
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='tb_sora_feedback'
        """)

        if not cursor.fetchone():
            logger.info("📋 tb_sora_feedback 表不存在，创建新表...")
            # 表不存在，直接创建
            cursor.execute("""
                CREATE TABLE tb_sora_feedback (
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

            # 创建索引
            cursor.execute("""
                CREATE INDEX idx_sora_feedback_video_id
                ON tb_sora_feedback(video_id)
            """)

            cursor.execute("""
                CREATE INDEX idx_sora_feedback_user_uuid
                ON tb_sora_feedback(user_uuid)
            """)

            cursor.execute("""
                CREATE INDEX idx_sora_feedback_is_liked
                ON tb_sora_feedback(is_liked)
            """)

            logger.info("✅ tb_sora_feedback 表创建成功")
            return

        # 2. 备份现有数据
        cursor.execute("SELECT * FROM tb_sora_feedback")
        existing_data = cursor.fetchall()
        logger.info(f"📋 备份了 {len(existing_data)} 条记录")

        # 3. 删除旧表
        cursor.execute("DROP TABLE tb_sora_feedback")
        logger.info("🗑️ 删除旧表")

        # 4. 创建新表（修复外键）
        cursor.execute("""
            CREATE TABLE tb_sora_feedback (
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
        logger.info("✅ 创建新表（正确的外键约束）")

        # 5. 创建索引
        cursor.execute("""
            CREATE INDEX idx_sora_feedback_video_id
            ON tb_sora_feedback(video_id)
        """)

        cursor.execute("""
            CREATE INDEX idx_sora_feedback_user_uuid
            ON tb_sora_feedback(user_uuid)
        """)

        cursor.execute("""
            CREATE INDEX idx_sora_feedback_is_liked
            ON tb_sora_feedback(is_liked)
        """)
        logger.info("📇 创建索引")

        # 6. 恢复数据
        if existing_data:
            cursor.executemany("""
                INSERT INTO tb_sora_feedback (id, video_id, user_uuid, is_liked, ctime, mtime)
                VALUES (?, ?, ?, ?, ?, ?)
            """, existing_data)
            logger.info(f"📥 恢复了 {len(existing_data)} 条记录")

        logger.info("✅ tb_sora_feedback 表修复成功！")

    def down(self, conn: sqlite3.Connection):
        """Rollback migration (not implemented)"""
        # 不支持回滚，因为外键约束错误本身就是bug
        pass
