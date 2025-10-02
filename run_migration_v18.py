#!/usr/bin/env python3
"""
运行数据库迁移 v18 - 删除 logo_url 字段
"""
import sys
import os

# 添加server目录到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'server'))

from services.migrations import v18_remove_logo_url
import sqlite3

DB_PATH = "/Users/caijunjie/Dev/open-jaaz/server/user_data/localmanus.db"

def main():
    print("🚀 开始运行迁移 v18: 删除 logo_url 字段")
    print("=" * 60)

    conn = sqlite3.connect(DB_PATH)

    try:
        # 显示迁移前的表结构
        print("\n📋 迁移前的表结构:")
        cursor = conn.execute("PRAGMA table_info(tb_user)")
        for row in cursor.fetchall():
            print(f"   {row}")

        # 执行迁移
        print("\n🔄 执行迁移...")
        v18_remove_logo_url.upgrade(conn)
        conn.commit()

        # 显示迁移后的表结构
        print("\n📋 迁移后的表结构:")
        cursor = conn.execute("PRAGMA table_info(tb_user)")
        for row in cursor.fetchall():
            print(f"   {row}")

        # 更新数据库版本
        print("\n🔄 更新数据库版本到 18...")
        conn.execute("UPDATE db_version SET version = 18")
        conn.commit()

        # 验证版本
        cursor = conn.execute("SELECT version FROM db_version")
        version = cursor.fetchone()[0]
        print(f"✅ 数据库版本: {version}")

        # 验证用户数据是否完整
        print("\n📋 验证用户数据:")
        cursor = conn.execute("SELECT id, email, image_url FROM tb_user WHERE email = 'yzcaijunjie@gmail.com'")
        user = cursor.fetchone()
        if user:
            print(f"   ID: {user[0]}")
            print(f"   Email: {user[1]}")
            print(f"   image_url: {user[2][:50] if user[2] else 'None'}...")

        print("\n" + "=" * 60)
        print("✅ 迁移完成！")

    except Exception as e:
        print(f"\n❌ 迁移失败: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    main()
