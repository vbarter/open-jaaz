#!/usr/bin/env python3
"""
导出 SQLite 数据库为适合 Cloudflare D1 导入的 SQL 文件。
"""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


def clean_dump(sql_text: str) -> str:
    skipped_prefixes = (
        "BEGIN TRANSACTION",
        "COMMIT",
        "PRAGMA foreign_keys",
    )
    cleaned_lines = []
    for line in sql_text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith(skipped_prefixes):
            continue
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines) + "\n"


def export_sqlite(db_path: Path, output_path: Path) -> None:
    conn = sqlite3.connect(str(db_path))
    try:
        dump_sql = "\n".join(conn.iterdump())
    finally:
        conn.close()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(clean_dump(dump_sql), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export SQLite database for D1 import")
    parser.add_argument("db_path", type=Path, help="SQLite database path")
    parser.add_argument("output_path", type=Path, help="Output SQL file path")
    args = parser.parse_args()

    export_sqlite(args.db_path, args.output_path)
    print(f"Exported {args.db_path} -> {args.output_path}")


if __name__ == "__main__":
    main()
