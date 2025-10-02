"""
Migration v18: Remove logo_url field from tb_user
只保留 image_url 字段用于存储用户头像
"""
import sqlite3
from log import get_logger

logger = get_logger(__name__)


def upgrade(conn: sqlite3.Connection):
    """执行升级"""
    logger.info("📦 Migration v18: Removing logo_url field from tb_user")

    # SQLite 不支持直接删除列，需要重建表
    # 1. 创建新表（不包含 logo_url）
    conn.execute("""
        CREATE TABLE tb_user_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            nickname TEXT NOT NULL,
            points INTEGER DEFAULT 0,
            ctime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            mtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            uuid TEXT UNIQUE NOT NULL,
            level TEXT DEFAULT 'free',
            subscription_id TEXT DEFAULT '',
            order_id TEXT DEFAULT '',
            image_url TEXT DEFAULT ''
        )
    """)

    # 2. 复制数据（排除 logo_url）
    conn.execute("""
        INSERT INTO tb_user_new (
            id, email, nickname, points, ctime, mtime, uuid, level,
            subscription_id, order_id, image_url
        )
        SELECT
            id, email, nickname, points, ctime, mtime, uuid, level,
            subscription_id, order_id, image_url
        FROM tb_user
    """)

    # 3. 删除旧表
    conn.execute("DROP TABLE tb_user")

    # 4. 重命名新表
    conn.execute("ALTER TABLE tb_user_new RENAME TO tb_user")

    # 5. 重建索引
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email ON tb_user(email)")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_uuid ON tb_user(uuid)")

    logger.info("✅ Migration v18 completed: logo_url field removed")


def downgrade(conn: sqlite3.Connection):
    """执行降级"""
    logger.info("📦 Migration v18 downgrade: Re-adding logo_url field")

    # 重新添加 logo_url 字段
    conn.execute("""
        ALTER TABLE tb_user
        ADD COLUMN logo_url TEXT DEFAULT ''
    """)

    logger.info("✅ Migration v18 downgrade completed")
