#!/usr/bin/env python3
"""
Export Supabase tables to JSON and D1-compatible SQL.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List

import httpx

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

TABLE_SCHEMAS: Dict[str, str] = {
    "tb_ma_template_prompt": """
CREATE TABLE IF NOT EXISTS tb_ma_template_prompt (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator TEXT NOT NULL,
    source TEXT NOT NULL,
    origin_text TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    video_url TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    owner TEXT NOT NULL,
    publish_time TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tb_ma_template_prompt_created_at ON tb_ma_template_prompt(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tb_ma_template_prompt_owner ON tb_ma_template_prompt(owner);
""".strip(),
    "tweet_info": """
CREATE TABLE IF NOT EXISTS tweet_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id TEXT NOT NULL UNIQUE,
    tweet_url TEXT,
    tweet_created_at TEXT,
    tweet_replay TEXT,
    user_id TEXT,
    mtime TEXT
);
CREATE INDEX IF NOT EXISTS idx_tweet_info_user_id ON tweet_info(user_id);
""".strip(),
    "retweet": """
CREATE TABLE IF NOT EXISTS retweet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tid TEXT NOT NULL UNIQUE,
    mid TEXT,
    tweet_id TEXT,
    retweet_info TEXT,
    lang TEXT DEFAULT 'default',
    ctime TEXT,
    mtime TEXT
);
CREATE INDEX IF NOT EXISTS idx_retweet_tweet_id ON retweet(tweet_id);
CREATE INDEX IF NOT EXISTS idx_retweet_mid ON retweet(mid);
""".strip(),
    "tweet_card": """
CREATE TABLE IF NOT EXISTS tweet_card (
    uid TEXT PRIMARY KEY,
    id TEXT,
    user_id TEXT,
    card_html TEXT NOT NULL,
    card_type TEXT NOT NULL DEFAULT 'uper',
    user_cookie TEXT,
    ctime TEXT DEFAULT CURRENT_TIMESTAMP,
    mtime TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tweet_card_user_id ON tweet_card(user_id);
CREATE INDEX IF NOT EXISTS idx_tweet_card_story_lookup ON tweet_card(id, card_type, ctime DESC);
""".strip(),
    "tweeter": """
CREATE TABLE IF NOT EXISTS tweeter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    user_name TEXT,
    nick_name TEXT,
    description TEXT,
    profile_picture TEXT,
    followers INTEGER DEFAULT 0,
    following INTEGER DEFAULT 0,
    created_at TEXT,
    statuses_count INTEGER DEFAULT 0,
    profile_banner_url TEXT,
    is_star INTEGER DEFAULT 0,
    mtime TEXT
);
CREATE INDEX IF NOT EXISTS idx_tweeter_is_star_followers ON tweeter(is_star, followers DESC);
""".strip(),
    "user_lastest_tweet": """
CREATE TABLE IF NOT EXISTS user_lastest_tweet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    tweet_id TEXT NOT NULL,
    tweet_url TEXT,
    text TEXT,
    created_at TEXT,
    author TEXT,
    extended_entities TEXT,
    card TEXT,
    entities TEXT,
    quote_count INTEGER DEFAULT 0,
    favorite_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    retweet_count INTEGER DEFAULT 0,
    entry TEXT,
    view_count INTEGER DEFAULT 0,
    UNIQUE(user_id, tweet_id)
);
CREATE INDEX IF NOT EXISTS idx_user_lastest_tweet_user_created_at ON user_lastest_tweet(user_id, created_at DESC);
""".strip(),
    "x_crawl_task": """
CREATE TABLE IF NOT EXISTS x_crawl_task (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL UNIQUE,
    status TEXT,
    message TEXT,
    mtime TEXT
);
""".strip(),
    "xiaohongshu_info": """
CREATE TABLE IF NOT EXISTS xiaohongshu_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id TEXT NOT NULL UNIQUE,
    tweet_url TEXT,
    title TEXT,
    time TEXT,
    description TEXT,
    images_list TEXT,
    mtime TEXT
);
""".strip(),
    "xiaohongshu_user": """
CREATE TABLE IF NOT EXISTS xiaohongshu_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    red_id TEXT NOT NULL UNIQUE,
    nickname TEXT,
    userid TEXT,
    image TEXT,
    name TEXT,
    mtime TEXT
);
""".strip(),
    "media_downloads": """
CREATE TABLE IF NOT EXISTS media_downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id TEXT,
    media_url TEXT,
    media_type TEXT,
    filename TEXT,
    file_size INTEGER,
    downloaded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_media_downloads_tweet_id ON media_downloads(tweet_id);
""".strip(),
}


def quote_value(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    text = json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else str(value)
    return "'" + text.replace("'", "''") + "'"


def build_insert_sql(table_name: str, rows: Iterable[Dict[str, Any]]) -> List[str]:
    statements: List[str] = []
    for row in rows:
        columns = list(row.keys())
        values = ", ".join(quote_value(row[column]) for column in columns)
        statements.append(
            f"INSERT OR REPLACE INTO {table_name} ({', '.join(columns)}) VALUES ({values});"
        )
    return statements


def fetch_table_rows(base_url: str, api_key: str, table_name: str, page_size: int) -> List[Dict[str, Any]]:
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }
    rows: List[Dict[str, Any]] = []
    offset = 0
    endpoint = f"{base_url.rstrip('/')}/rest/v1/{table_name}"

    with httpx.Client(timeout=120.0) as client:
        while True:
            response = client.get(
                endpoint,
                headers=headers,
                params={
                    "select": "*",
                    "limit": page_size,
                    "offset": offset,
                },
            )
            response.raise_for_status()
            batch = response.json()
            if not batch:
                break
            rows.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size
    return rows


def export_tables(output_dir: Path, tables: List[str], page_size: int) -> None:
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    supabase_key = os.getenv("SUPABASE_KEY", "").strip()
    if not supabase_url or not supabase_key:
        raise SystemExit("SUPABASE_URL or SUPABASE_KEY is missing")

    output_dir.mkdir(parents=True, exist_ok=True)
    sql_parts: List[str] = ["PRAGMA foreign_keys=OFF;"]

    for table_name in tables:
        if table_name not in TABLE_SCHEMAS:
            raise SystemExit(f"Unsupported table schema: {table_name}")

        rows = fetch_table_rows(supabase_url, supabase_key, table_name, page_size)
        (output_dir / f"{table_name}.json").write_text(
            json.dumps(rows, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        sql_parts.append(TABLE_SCHEMAS[table_name] + "\n")
        sql_parts.extend(build_insert_sql(table_name, rows))
        sql_parts.append("")
        print(f"exported {table_name}: {len(rows)} rows")

    (output_dir / "supabase_to_d1.sql").write_text(
        "\n".join(sql_parts).strip() + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Supabase tables to D1 files")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("server/data/supabase_export"),
        help="Directory for JSON and SQL output",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=1000,
        help="Rows per Supabase fetch",
    )
    parser.add_argument(
        "--tables",
        nargs="*",
        default=list(TABLE_SCHEMAS.keys()),
        help="Subset of tables to export",
    )
    args = parser.parse_args()
    export_tables(args.output_dir, args.tables, args.page_size)


if __name__ == "__main__":
    main()
