#!/usr/bin/env python3
"""
Import a SQLite database into Cloudflare D1 using table/row level operations.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections import defaultdict, deque
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from services.db_runtime import get_database_runtime


def execute_statement(runtime, sql: str, params: Sequence[object] | None = None) -> dict:
    payload: Dict[str, object] = {"sql": sql if sql.endswith(";") else f"{sql};"}
    if params:
        payload["params"] = list(params)

    with runtime.create_d1_client() as client:
        response = client.post(runtime.get_d1_query_url(), json=payload)
        data = response.json()
        if response.status_code >= 400 or not data.get("success", False):
            raise RuntimeError(json.dumps(data, ensure_ascii=False))
        return data


def ensure_idempotent_schema_sql(sql: str) -> str:
    upper = sql.upper()
    if upper.startswith("CREATE TABLE ") and "IF NOT EXISTS" not in upper:
        return sql.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", 1)
    if upper.startswith("CREATE UNIQUE INDEX ") and "IF NOT EXISTS" not in upper:
        return sql.replace("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ", 1)
    if upper.startswith("CREATE INDEX ") and "IF NOT EXISTS" not in upper:
        return sql.replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", 1)
    return sql


def load_table_sql(conn: sqlite3.Connection) -> List[Tuple[str, str]]:
    rows = conn.execute(
        """
        SELECT name, sql
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
          AND sql IS NOT NULL
        ORDER BY name
        """
    ).fetchall()
    return [(row[0], row[1]) for row in rows]


def load_index_sql(conn: sqlite3.Connection) -> List[str]:
    rows = conn.execute(
        """
        SELECT sql
        FROM sqlite_master
        WHERE type = 'index'
          AND name NOT LIKE 'sqlite_%'
          AND sql IS NOT NULL
        ORDER BY name
        """
    ).fetchall()
    return [row[0] for row in rows]


def topo_sort_tables(conn: sqlite3.Connection, tables: Iterable[str]) -> List[str]:
    table_set = set(tables)
    deps: Dict[str, set[str]] = {}
    reverse: Dict[str, set[str]] = defaultdict(set)

    for table in table_set:
        fk_rows = conn.execute(f'PRAGMA foreign_key_list("{table}")').fetchall()
        table_deps = {row[2] for row in fk_rows if row[2] in table_set and row[2] != table}
        deps[table] = table_deps
        for dep in table_deps:
            reverse[dep].add(table)

    queue = deque(sorted([table for table, table_deps in deps.items() if not table_deps]))
    order: List[str] = []

    while queue:
        table = queue.popleft()
        order.append(table)
        for child in sorted(reverse.get(table, set())):
            deps[child].discard(table)
            if not deps[child]:
                queue.append(child)

    if len(order) != len(table_set):
        remaining = sorted(table_set - set(order))
        raise RuntimeError(f"Unable to resolve table dependency order: {remaining}")

    return order


def import_rows_for_table(runtime, conn: sqlite3.Connection, table: str) -> int:
    conn.row_factory = sqlite3.Row
    rows = conn.execute(f'SELECT * FROM "{table}"').fetchall()
    if not rows:
        return 0

    columns = rows[0].keys()
    quoted_columns = ", ".join(f'"{column}"' for column in columns)
    placeholders = ", ".join(["?"] * len(columns))
    sql = f'INSERT OR REPLACE INTO "{table}" ({quoted_columns}) VALUES ({placeholders})'

    imported = 0
    skipped_fk = 0
    for row in rows:
        try:
            execute_statement(runtime, sql, [row[column] for column in columns])
            imported += 1
        except Exception as exc:
            if "FOREIGN KEY constraint failed" in str(exc):
                skipped_fk += 1
                continue
            raise
    if skipped_fk:
        print(f"data table {table} skipped_fk_rows={skipped_fk}")
    return imported


def main() -> None:
    parser = argparse.ArgumentParser(description="Import a SQLite DB directly into D1")
    parser.add_argument("sqlite_db_path", type=Path, help="SQLite database path")
    args = parser.parse_args()

    runtime = get_database_runtime(str(args.sqlite_db_path))
    if runtime.provider != "d1":
        raise SystemExit("DATABASE_PROVIDER is not set to d1 or D1 env vars are missing")

    conn = sqlite3.connect(str(args.sqlite_db_path))
    try:
        table_sql = load_table_sql(conn)
        table_names = [name for name, _ in table_sql]
        ordered_tables = topo_sort_tables(conn, table_names)
        table_sql_map = dict(table_sql)
        index_sql = load_index_sql(conn)

        for table in ordered_tables:
            execute_statement(runtime, ensure_idempotent_schema_sql(table_sql_map[table]))
            print(f"schema table {table} ok")

        for table in ordered_tables:
            count = import_rows_for_table(runtime, conn, table)
            print(f"data table {table} rows={count}")

        for statement in index_sql:
            execute_statement(runtime, ensure_idempotent_schema_sql(statement))
        print(f"indexes ok count={len(index_sql)}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
