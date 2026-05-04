#!/usr/bin/env python3
"""
Import exported JSON datasets into Cloudflare D1.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from services.db_runtime import execute_d1_sql_file, get_database_runtime

from export_supabase_to_d1 import TABLE_SCHEMAS, build_insert_sql


def chunk_sql(statements: Iterable[str], max_chars: int = 750_000) -> List[str]:
    chunks: List[str] = []
    current: List[str] = []
    current_size = 0
    for statement in statements:
        sql = statement if statement.endswith(";") else f"{statement};"
        if current and current_size + len(sql) > max_chars:
            chunks.append("\n".join(current))
            current = []
            current_size = 0
        current.append(sql)
        current_size += len(sql)
    if current:
        chunks.append("\n".join(current))
    return chunks


def load_rows(path: Path) -> List[Dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Import exported JSON datasets into D1")
    parser.add_argument("sqlite_reference_path", help="Reference sqlite path used to load D1 runtime config")
    parser.add_argument("input_dir", type=Path, help="Directory containing exported JSON files")
    parser.add_argument(
        "--tables",
        nargs="*",
        default=list(TABLE_SCHEMAS.keys()),
        help="Subset of tables to import",
    )
    args = parser.parse_args()

    runtime = get_database_runtime(args.sqlite_reference_path)
    if runtime.provider != "d1":
        raise SystemExit("DATABASE_PROVIDER is not set to d1 or D1 env vars are missing")

    create_sql = "\n\n".join(TABLE_SCHEMAS[table] for table in args.tables)
    execute_d1_sql_file(runtime, create_sql)
    print("schema initialized")

    for table_name in args.tables:
        rows = load_rows(args.input_dir / f"{table_name}.json")
        statements = build_insert_sql(table_name, rows)
        chunks = chunk_sql(statements)
        for index, chunk in enumerate(chunks, start=1):
            result = execute_d1_sql_file(runtime, chunk)
            print(f"{table_name} chunk {index}/{len(chunks)} success={result.get('success')}")


if __name__ == "__main__":
    main()
