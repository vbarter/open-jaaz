"""
`tb_ma_template_prompt` repository with D1-first storage and Supabase fallback.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import httpx
import sqlite3

logger = logging.getLogger("prompt_repository")


class PromptRepository:
    TABLE_NAME = "tb_ma_template_prompt"

    def __init__(self) -> None:
        self.provider = os.getenv("PROMPT_STORAGE_PROVIDER", "").strip().lower()
        self.d1_account_id = os.getenv("D1_ACCOUNT_ID", "").strip()
        self.d1_database_id = os.getenv("D1_DATABASE_ID", "").strip()
        self.d1_api_token = os.getenv("D1_API_TOKEN", "").strip()
        self.d1_http_base = os.getenv("D1_HTTP_BASE", "").strip().rstrip("/")
        self.sqlite_path = self._resolve_sqlite_path()

    def _resolve_sqlite_path(self) -> str:
        candidates = [
            os.getenv("PROMPT_SQLITE_PATH", "").strip(),
            os.getenv("DATABASE_PATH", "").strip(),
            str(Path(__file__).resolve().parents[1] / "localmanus.db"),
        ]
        for candidate in candidates:
            if candidate:
                return candidate
        return str(Path(__file__).resolve().parents[1] / "localmanus.db")

    @property
    def d1_enabled(self) -> bool:
        return bool(self.d1_http_base or (
            self.d1_account_id and self.d1_database_id and self.d1_api_token
        ))

    @property
    def use_d1(self) -> bool:
        if self.provider:
            return self.provider == "d1" and self.d1_enabled
        return self.d1_enabled

    @property
    def use_sqlite(self) -> bool:
        return self.provider == "sqlite"

    def _d1_query_url(self) -> str:
        if self.d1_http_base:
            return urljoin(f"{self.d1_http_base}/", "query")
        return (
            "https://api.cloudflare.com/client/v4/accounts/"
            f"{self.d1_account_id}/d1/database/{self.d1_database_id}/query"
        )

    def _sqlite_connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.sqlite_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _normalize_rows(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        normalized: List[Dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            for key in ("id",):
                if key in item and item[key] is not None:
                    try:
                        item[key] = int(item[key])
                    except (TypeError, ValueError):
                        pass
            normalized.append(item)
        return normalized

    def _execute_d1(self, sql: str, params: Optional[List[Any]] = None) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"sql": sql}
        if params:
            payload["params"] = params

        headers = {"Content-Type": "application/json"}
        if self.d1_api_token:
            headers["Authorization"] = f"Bearer {self.d1_api_token}"
        response = httpx.post(
            self._d1_query_url(),
            headers=headers,
            json=payload,
            timeout=60.0,
        )
        response.raise_for_status()
        data = response.json()
        if not data.get("success", False):
            raise RuntimeError(f"D1 query failed: {data}")
        result = data.get("result", []) or [{}]
        first = result[0] if result else {}
        return {
            "rows": first.get("results", []) or [],
            "meta": first.get("meta", {}) or {},
            "raw": data,
        }

    def _insert_sqlite(self, prompt_data: Dict[str, Any]) -> Dict[str, Any]:
        fields = list(prompt_data.keys())
        placeholders = ", ".join(["?"] * len(fields))
        sql = (
            f"INSERT INTO {self.TABLE_NAME} ({', '.join(fields)}) "
            f"VALUES ({placeholders})"
        )
        with self._sqlite_connect() as conn:
            cursor = conn.execute(sql, [prompt_data[field] for field in fields])
            conn.commit()
            prompt_id = cursor.lastrowid
            return self.get_by_id(prompt_id) or {"id": prompt_id, **prompt_data}

    def _insert_d1(self, prompt_data: Dict[str, Any]) -> Dict[str, Any]:
        fields = list(prompt_data.keys())
        placeholders = ", ".join(["?"] * len(fields))
        sql = (
            f"INSERT INTO {self.TABLE_NAME} ({', '.join(fields)}) "
            f"VALUES ({placeholders}) RETURNING *"
        )
        result = self._execute_d1(sql, [prompt_data[field] for field in fields])
        rows = self._normalize_rows(result["rows"])
        if rows:
            return rows[0]

        fallback = self._execute_d1("SELECT last_insert_rowid() AS id")
        rows = self._normalize_rows(fallback["rows"])
        prompt_id = rows[0]["id"] if rows else None
        if prompt_id is None:
            raise RuntimeError("D1 insert succeeded but no inserted id returned")
        record = self.get_by_id(prompt_id)
        if record is None:
            raise RuntimeError("D1 insert succeeded but record reload failed")
        return record

    def insert(self, prompt_data: Dict[str, Any]) -> Dict[str, Any]:
        if self.use_d1:
            return self._insert_d1(prompt_data)
        if self.use_sqlite:
            return self._insert_sqlite(prompt_data)
        return self._insert_supabase(prompt_data)

    def get_by_id(self, prompt_id: int) -> Optional[Dict[str, Any]]:
        if self.use_d1:
            sql = f"SELECT * FROM {self.TABLE_NAME} WHERE id = ? LIMIT 1"
            rows = self._normalize_rows(self._execute_d1(sql, [prompt_id])["rows"])
            return rows[0] if rows else None
        if not self.use_sqlite:
            return self._get_by_id_supabase(prompt_id)

        with self._sqlite_connect() as conn:
            row = conn.execute(
                f"SELECT * FROM {self.TABLE_NAME} WHERE id = ? LIMIT 1",
                (prompt_id,),
            ).fetchone()
            return dict(row) if row else None

    def list_prompts(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        order_clause = "ORDER BY created_at DESC, id DESC"
        if self.use_d1:
            sql = (
                f"SELECT * FROM {self.TABLE_NAME} {order_clause} "
                "LIMIT ? OFFSET ?"
            )
            return self._normalize_rows(
                self._execute_d1(sql, [limit, offset])["rows"]
            )
        if not self.use_sqlite:
            return self._list_prompts_supabase(limit=limit, offset=offset)

        with self._sqlite_connect() as conn:
            rows = conn.execute(
                f"SELECT * FROM {self.TABLE_NAME} {order_clause} LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
            return [dict(row) for row in rows]

    def count_prompts(self) -> int:
        if self.use_d1:
            rows = self._normalize_rows(
                self._execute_d1(
                    f"SELECT COUNT(*) AS count FROM {self.TABLE_NAME}"
                )["rows"]
            )
            return int(rows[0]["count"]) if rows else 0
        if not self.use_sqlite:
            return self._count_prompts_supabase()

        with self._sqlite_connect() as conn:
            row = conn.execute(
                f"SELECT COUNT(*) AS count FROM {self.TABLE_NAME}"
            ).fetchone()
            return int(row["count"]) if row else 0

    def count_search_prompts(self, query: str) -> int:
        pattern = f"%{query.lower()}%"
        if self.use_d1:
            rows = self._normalize_rows(
                self._execute_d1(
                    f"SELECT COUNT(*) AS count FROM {self.TABLE_NAME} WHERE lower(prompt) LIKE ?",
                    [pattern],
                )["rows"]
            )
            return int(rows[0]["count"]) if rows else 0
        if not self.use_sqlite:
            return self._count_search_supabase(query)

        with self._sqlite_connect() as conn:
            row = conn.execute(
                f"SELECT COUNT(*) AS count FROM {self.TABLE_NAME} WHERE lower(prompt) LIKE ?",
                (pattern,),
            ).fetchone()
            return int(row["count"]) if row else 0

    def search_prompts(self, query: str, limit: int, offset: int) -> List[Dict[str, Any]]:
        pattern = f"%{query.lower()}%"
        order_clause = "ORDER BY created_at DESC, id DESC"
        if self.use_d1:
            sql = (
                f"SELECT * FROM {self.TABLE_NAME} "
                "WHERE lower(prompt) LIKE ? "
                f"{order_clause} LIMIT ? OFFSET ?"
            )
            return self._normalize_rows(
                self._execute_d1(sql, [pattern, limit, offset])["rows"]
            )
        if not self.use_sqlite:
            return self._search_prompts_supabase(query=query, limit=limit, offset=offset)

        with self._sqlite_connect() as conn:
            rows = conn.execute(
                f"SELECT * FROM {self.TABLE_NAME} WHERE lower(prompt) LIKE ? "
                f"{order_clause} LIMIT ? OFFSET ?",
                (pattern, limit, offset),
            ).fetchall()
            return [dict(row) for row in rows]

    def _execute_supabase(self, operation):
        from superbase import SupabaseService

        result = SupabaseService.execute_with_retry(operation)
        if result is None:
            raise RuntimeError("Supabase operation returned no result")
        return result

    def _insert_supabase(self, prompt_data: Dict[str, Any]) -> Dict[str, Any]:
        def operation(client):
            return client.table(self.TABLE_NAME).insert(prompt_data).execute()

        result = self._execute_supabase(operation)
        if result.data:
            return result.data[0] if isinstance(result.data, list) else result.data
        raise RuntimeError("Supabase insert returned no rows")

    def _get_by_id_supabase(self, prompt_id: int) -> Optional[Dict[str, Any]]:
        def operation(client):
            return (
                client.table(self.TABLE_NAME)
                .select("*")
                .eq("id", prompt_id)
                .limit(1)
                .execute()
            )

        result = self._execute_supabase(operation)
        if result.data:
            return result.data[0]
        return None

    def _list_prompts_supabase(self, limit: int, offset: int) -> List[Dict[str, Any]]:
        def operation(client):
            return (
                client.table(self.TABLE_NAME)
                .select("*")
                .order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )

        result = self._execute_supabase(operation)
        return result.data or []

    def _count_prompts_supabase(self) -> int:
        def operation(client):
            return client.table(self.TABLE_NAME).select("*", count="exact").limit(0).execute()

        result = self._execute_supabase(operation)
        return int(result.count or 0)

    def _count_search_supabase(self, query: str) -> int:
        def operation(client):
            return (
                client.table(self.TABLE_NAME)
                .select("*", count="exact")
                .ilike("prompt", f"%{query}%")
                .limit(0)
                .execute()
            )

        result = self._execute_supabase(operation)
        return int(result.count or 0)

    def _search_prompts_supabase(self, query: str, limit: int, offset: int) -> List[Dict[str, Any]]:
        def operation(client):
            return (
                client.table(self.TABLE_NAME)
                .select("*")
                .ilike("prompt", f"%{query}%")
                .order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )

        result = self._execute_supabase(operation)
        return result.data or []


prompt_repository = PromptRepository()
