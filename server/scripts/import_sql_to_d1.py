#!/usr/bin/env python3
"""
导入 SQL 文件到 Cloudflare D1。
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from services.db_runtime import execute_d1_sql_file, get_database_runtime


def split_sql_statements(sql_text: str) -> list[str]:
    statements = []
    buffer = []
    for line in sql_text.splitlines():
        buffer.append(line)
        candidate = "\n".join(buffer).strip()
        if candidate and sqlite3.complete_statement(candidate):
            statements.append(candidate)
            buffer = []
    if buffer:
        remainder = "\n".join(buffer).strip()
        if remainder:
            statements.append(remainder)
    return statements


def chunk_statements(statements: list[str], max_chars: int = 750_000) -> list[str]:
    chunks: list[str] = []
    current: list[str] = []
    current_size = 0
    for statement in statements:
        statement_sql = statement if statement.endswith(";") else f"{statement};"
        if current and current_size + len(statement_sql) > max_chars:
            chunks.append("\n".join(current))
            current = []
            current_size = 0
        current.append(statement_sql)
        current_size += len(statement_sql)
    if current:
        chunks.append("\n".join(current))
    return chunks


def normalize_statement(statement: str) -> str:
    return statement.strip().rstrip(";")


def filter_sqlite_internal_statements(statements: list[str]) -> list[str]:
    filtered: list[str] = []
    for statement in statements:
        normalized = normalize_statement(statement)
        upper = normalized.upper()
        if '"SQLITE_SEQUENCE"' in upper:
            continue
        filtered.append(normalized)
    return filtered


def split_schema_and_data(statements: list[str]) -> tuple[list[str], list[str]]:
    schema_statements: list[str] = []
    data_statements: list[str] = []

    for statement in filter_sqlite_internal_statements(statements):
        upper = statement.upper()
        if upper.startswith("CREATE TABLE") or upper.startswith("CREATE INDEX") or upper.startswith("CREATE UNIQUE INDEX"):
            schema_statements.append(statement)
        elif upper.startswith("INSERT INTO"):
            data_statements.append(statement)
        else:
            schema_statements.append(statement)

    return schema_statements, data_statements


def execute_statement(runtime, statement: str) -> dict:
    sql = statement if statement.endswith(";") else f"{statement};"
    with runtime.create_d1_client() as client:
        response = client.post(runtime.get_d1_query_url(), json={"sql": sql})
        data = response.json()
        if response.status_code >= 400 or not data.get("success", False):
            raise RuntimeError(json.dumps(data, ensure_ascii=False))
        return data


def import_data_with_fk_retries(runtime, statements: list[str]) -> None:
    pending = list(statements)
    pass_index = 0

    while pending:
        pass_index += 1
        next_pending: list[str] = []
        imported = 0

        for statement in pending:
            try:
                execute_statement(runtime, statement)
                imported += 1
            except Exception as exc:
                message = str(exc)
                if "FOREIGN KEY constraint failed" in message:
                    next_pending.append(statement)
                    continue
                raise

        print(
            f"data pass {pass_index}: imported={imported} deferred={len(next_pending)}"
        )

        if next_pending and imported == 0:
            preview = next_pending[0][:500]
            raise RuntimeError(
                f"Unable to resolve deferred foreign-key inserts. First pending statement: {preview}"
            )

        pending = next_pending


def main() -> None:
    parser = argparse.ArgumentParser(description="Import SQL file into Cloudflare D1")
    parser.add_argument("sqlite_reference_path", help="Reference sqlite path used to load env/runtime config")
    parser.add_argument("sql_file", type=Path, help="SQL file path")
    args = parser.parse_args()

    runtime = get_database_runtime(args.sqlite_reference_path)
    if runtime.provider != "d1":
        raise SystemExit("DATABASE_PROVIDER is not set to d1 or D1 env vars are missing")

    sql_text = args.sql_file.read_text(encoding="utf-8")
    statements = split_sql_statements(sql_text)
    schema_statements, data_statements = split_schema_and_data(statements)

    for label, group in (("schema", schema_statements), ("data", data_statements)):
        if label == "data":
            import_data_with_fk_retries(runtime, group)
            continue

        chunks = chunk_statements(group)
        for index, chunk in enumerate(chunks, start=1):
            result = execute_d1_sql_file(runtime, chunk)
            print(f"{label} chunk {index}/{len(chunks)} success={result.get('success')}")


if __name__ == "__main__":
    main()
