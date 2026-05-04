"""
统一数据库连接运行时。

当前策略：
- `sqlite` 模式：继续使用本地 SQLite
- `d1` 模式：提供 D1 HTTP 客户端和连接工厂

说明：
- 这个模块先解决“入口统一”和“迁移脚本接入”问题
- 业务层仍可分阶段从直接 `aiosqlite/sqlite3` 迁到本模块
"""

from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from contextlib import asynccontextmanager
from typing import Any, Dict, Iterable, List, Optional, Sequence
from urllib.parse import urljoin

import httpx
import aiosqlite as native_aiosqlite

from log import get_logger

logger = get_logger(__name__)


@dataclass
class DatabaseConfig:
    provider: str
    sqlite_path: str
    d1_account_id: str = ""
    d1_database_id: str = ""
    d1_api_token: str = ""
    d1_http_base: str = ""

    @property
    def is_d1_enabled(self) -> bool:
        if self.provider != "d1":
            return False
        if self.d1_http_base:
            return True
        return bool(self.d1_account_id and self.d1_database_id and self.d1_api_token)


def load_database_config(sqlite_path: str) -> DatabaseConfig:
    return DatabaseConfig(
        provider=os.getenv("DATABASE_PROVIDER", "sqlite").strip().lower(),
        sqlite_path=sqlite_path,
        d1_account_id=os.getenv("D1_ACCOUNT_ID", ""),
        d1_database_id=os.getenv("D1_DATABASE_ID", ""),
        d1_api_token=os.getenv("D1_API_TOKEN", ""),
        d1_http_base=os.getenv("D1_HTTP_BASE", "").strip().rstrip("/"),
    )


class DatabaseRuntime:
    def __init__(self, config: DatabaseConfig):
        self.config = config

    @property
    def provider(self) -> str:
        return "d1" if self.config.is_d1_enabled else "sqlite"

    @property
    def db_path(self) -> str:
        return self.config.sqlite_path

    def sync_connect(self) -> sqlite3.Connection:
        if self.provider != "sqlite":
            raise RuntimeError("D1 模式不支持 sqlite3.connect，本调用点需要重构")
        return sqlite3.connect(self.config.sqlite_path)

    async def async_connect(self) -> native_aiosqlite.Connection:
        if self.provider != "sqlite":
            raise RuntimeError("D1 模式不支持直接 native aiosqlite.connect")
        return await native_aiosqlite.connect(self.config.sqlite_path)

    @asynccontextmanager
    async def connect(self):
        conn = await self.async_connect()
        try:
            yield conn
        finally:
            await conn.close()

    def get_d1_query_url(self) -> str:
        if self.config.d1_http_base:
            return urljoin(f"{self.config.d1_http_base}/", "query")
        return (
            f"https://api.cloudflare.com/client/v4/accounts/"
            f"{self.config.d1_account_id}/d1/database/{self.config.d1_database_id}/query"
        )

    def create_d1_client(self) -> httpx.Client:
        if not self.config.is_d1_enabled:
            raise RuntimeError("当前未启用 D1")
        headers = {"Content-Type": "application/json"}
        if self.config.d1_api_token:
            headers["Authorization"] = f"Bearer {self.config.d1_api_token}"
        return httpx.Client(headers=headers, timeout=60.0)

    def create_async_d1_client(self) -> httpx.AsyncClient:
        if not self.config.is_d1_enabled:
            raise RuntimeError("当前未启用 D1")
        headers = {"Content-Type": "application/json"}
        if self.config.d1_api_token:
            headers["Authorization"] = f"Bearer {self.config.d1_api_token}"
        return httpx.AsyncClient(headers=headers, timeout=60.0)


def execute_d1_sql_file(runtime: DatabaseRuntime, sql_text: str) -> dict:
    if runtime.provider != "d1":
        raise RuntimeError("execute_d1_sql_file 仅支持 D1 模式")

    payload = {"sql": sql_text}
    with runtime.create_d1_client() as client:
        response = client.post(runtime.get_d1_query_url(), json=payload)
        response.raise_for_status()
        data = response.json()
        if not data.get("success", False):
            raise RuntimeError(f"D1 SQL 执行失败: {data}")
        return data


class D1Row(dict):
    def __init__(self, values: Dict[str, Any]):
        super().__init__(values)
        self._ordered_values = list(values.values())

    def __getitem__(self, item):
        if isinstance(item, int):
            return self._ordered_values[item]
        return super().__getitem__(item)


class D1Cursor:
    def __init__(
        self,
        rows: Optional[List[Any]] = None,
        *,
        rowcount: int = 0,
        lastrowid: Optional[int] = None,
        row_factory: Any = None,
    ):
        self._rows = rows or []
        self.rowcount = rowcount
        self.lastrowid = lastrowid
        self._index = 0
        self._row_factory = row_factory

    def _convert(self, row: Any) -> Any:
        if row is None:
            return None
        if isinstance(row, dict):
            return D1Row(row)
        return row

    async def fetchone(self):
        if self._index >= len(self._rows):
            return None
        row = self._rows[self._index]
        self._index += 1
        return self._convert(row)

    async def fetchall(self):
        rows = self._rows[self._index :]
        self._index = len(self._rows)
        return [self._convert(row) for row in rows]

    def __aiter__(self):
        return self

    async def __anext__(self):
        row = await self.fetchone()
        if row is None:
            raise StopAsyncIteration
        return row


def _parse_d1_response(data: dict) -> Dict[str, Any]:
    if not data.get("success", False):
        raise RuntimeError(f"D1 查询失败: {data}")

    result = data.get("result", [])
    first = result[0] if result else {}
    rows = first.get("results", []) or []
    meta = first.get("meta", {}) or {}
    rowcount = meta.get("changes")
    if rowcount is None:
        rowcount = meta.get("rows_written")
    if rowcount is None:
        rowcount = len(rows)
    return {
        "rows": rows,
        "rowcount": rowcount,
        "lastrowid": meta.get("last_row_id"),
    }


class D1Connection:
    def __init__(self, runtime: DatabaseRuntime):
        self.runtime = runtime
        self.row_factory: Any = None

    def __await__(self):
        async def _return_self():
            return self

        return _return_self().__await__()

    async def execute(self, query: str, params: Sequence[Any] = ()):
        payload = {"sql": query, "params": list(params)}
        async with self.runtime.create_async_d1_client() as client:
            response = await client.post(self.runtime.get_d1_query_url(), json=payload)
            response.raise_for_status()
            parsed = _parse_d1_response(response.json())
            return D1Cursor(
                parsed["rows"],
                rowcount=parsed["rowcount"],
                lastrowid=parsed["lastrowid"],
                row_factory=self.row_factory,
            )

    async def executemany(self, query: str, seq_of_params: Iterable[Sequence[Any]]):
        for params in seq_of_params:
            await self.execute(query, params)

    async def commit(self):
        return None

    async def rollback(self):
        return None

    async def close(self):
        return None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()


_runtime_cache: Dict[str, DatabaseRuntime] = {}


def get_database_runtime(sqlite_path: str) -> DatabaseRuntime:
    runtime = _runtime_cache.get(sqlite_path)
    if runtime is None:
        runtime = DatabaseRuntime(load_database_config(sqlite_path))
        _runtime_cache[sqlite_path] = runtime
    return runtime


class AioSqliteCompat:
    Connection = Any

    @staticmethod
    def connect(path: str):
        runtime = get_database_runtime(path)
        if runtime.provider == "d1":
            return D1Connection(runtime)
        return native_aiosqlite.connect(path)


aiosqlite_compat = AioSqliteCompat()
