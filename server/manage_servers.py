#!/usr/bin/env python3
"""
服务器管理工具
用于手动添加、查看、启用/禁用 Sora 任务处理服务器
"""
import asyncio
import sys
import os

# Add server directory to path
sys.path.insert(0, os.path.dirname(__file__))

from services.sora_task_service import sora_task_service
from services.db_runtime import aiosqlite_compat as aiosqlite


async def list_servers():
    """列出所有服务器"""
    import sqlite3

    async with aiosqlite.connect(sora_task_service.db_path) as db:
        db.row_factory = sqlite3.Row
        cursor = await db.execute(
            """
            SELECT id, ip, total_tasks, status, ctime, mtime
            FROM tb_sora_server
            ORDER BY id
            """
        )
        rows = await cursor.fetchall()

    if not rows:
        print("📭 No servers registered")
        return

    print("\n" + "=" * 80)
    print("Registered Servers")
    print("=" * 80)
    print(f"{'ID':<5} {'IP':<20} {'Tasks':<8} {'Status':<10} {'Created':<20}")
    print("-" * 80)

    for row in rows:
        status_text = "✅ Active" if row['status'] == 0 else "❌ Inactive"
        print(f"{row['id']:<5} {row['ip']:<20} {row['total_tasks']:<8} {status_text:<10} {row['ctime']:<20}")

    print("=" * 80)
    print(f"Total: {len(rows)} servers\n")


async def add_server(ip: str):
    """添加新服务器"""
    try:
        server_id = await sora_task_service.create_server(ip)
        print(f"✅ Server {ip} added successfully (ID: {server_id})")
    except ValueError as e:
        print(f"❌ Error: {e}")
    except Exception as e:
        print(f"❌ Failed to add server: {e}")


async def enable_server(ip: str):
    """启用服务器"""
    async with aiosqlite.connect(sora_task_service.db_path) as db:
        cursor = await db.execute(
            "SELECT id FROM tb_sora_server WHERE ip = ?",
            (ip,)
        )
        row = await cursor.fetchone()

        if not row:
            print(f"❌ Server {ip} not found")
            return

        await db.execute(
            """
            UPDATE tb_sora_server
            SET status = 0, mtime = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE ip = ?
            """,
            (ip,)
        )
        await db.commit()

    print(f"✅ Server {ip} enabled")


async def disable_server(ip: str):
    """禁用服务器"""
    async with aiosqlite.connect(sora_task_service.db_path) as db:
        cursor = await db.execute(
            "SELECT id FROM tb_sora_server WHERE ip = ?",
            (ip,)
        )
        row = await cursor.fetchone()

        if not row:
            print(f"❌ Server {ip} not found")
            return

        await db.execute(
            """
            UPDATE tb_sora_server
            SET status = 1, mtime = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE ip = ?
            """,
            (ip,)
        )
        await db.commit()

    print(f"✅ Server {ip} disabled")


async def remove_server(ip: str):
    """删除服务器"""
    async with aiosqlite.connect(sora_task_service.db_path) as db:
        cursor = await db.execute(
            "SELECT id FROM tb_sora_server WHERE ip = ?",
            (ip,)
        )
        row = await cursor.fetchone()

        if not row:
            print(f"❌ Server {ip} not found")
            return

        # 检查是否有运行中的任务
        cursor = await db.execute(
            """
            SELECT COUNT(*) FROM tb_sora_task
            WHERE server_ip = ? AND status = 'running'
            """,
            (ip,)
        )
        count_row = await cursor.fetchone()
        running_tasks = count_row[0] if count_row else 0

        if running_tasks > 0:
            print(f"⚠️ Warning: Server {ip} has {running_tasks} running tasks")
            confirm = input("Are you sure you want to remove it? (yes/no): ")
            if confirm.lower() != 'yes':
                print("❌ Cancelled")
                return

        await db.execute("DELETE FROM tb_sora_server WHERE ip = ?", (ip,))
        await db.commit()

    print(f"✅ Server {ip} removed")


def print_usage():
    """打印使用说明"""
    print("""
Sora Server Management Tool

Usage:
    python manage_servers.py list                  - List all servers
    python manage_servers.py add <ip>              - Add a new server
    python manage_servers.py enable <ip>           - Enable a server
    python manage_servers.py disable <ip>          - Disable a server
    python manage_servers.py remove <ip>           - Remove a server

Examples:
    python manage_servers.py list
    python manage_servers.py add 192.168.1.100
    python manage_servers.py enable 192.168.1.100
    python manage_servers.py disable 192.168.1.100
    python manage_servers.py remove 192.168.1.100
    """)


async def main():
    """主函数"""
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "list":
        await list_servers()

    elif command == "add":
        if len(sys.argv) < 3:
            print("❌ Error: IP address required")
            print("Usage: python manage_servers.py add <ip>")
            sys.exit(1)
        ip = sys.argv[2]
        await add_server(ip)

    elif command == "enable":
        if len(sys.argv) < 3:
            print("❌ Error: IP address required")
            print("Usage: python manage_servers.py enable <ip>")
            sys.exit(1)
        ip = sys.argv[2]
        await enable_server(ip)

    elif command == "disable":
        if len(sys.argv) < 3:
            print("❌ Error: IP address required")
            print("Usage: python manage_servers.py disable <ip>")
            sys.exit(1)
        ip = sys.argv[2]
        await disable_server(ip)

    elif command == "remove":
        if len(sys.argv) < 3:
            print("❌ Error: IP address required")
            print("Usage: python manage_servers.py remove <ip>")
            sys.exit(1)
        ip = sys.argv[2]
        await remove_server(ip)

    else:
        print(f"❌ Unknown command: {command}")
        print_usage()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
