#!/usr/bin/env python3
"""
将远程 URL 列表下载后重新上传到当前对象存储。

输入文件格式：
- 每行一个 URL
"""

from __future__ import annotations

import argparse
import mimetypes
import sys
from pathlib import Path
from urllib.parse import urlparse

import httpx

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from utils.object_storage import get_object_storage_service


def build_key(url: str, key_prefix: str = "") -> str:
    filename = Path(urlparse(url).path).name
    return f"{key_prefix.rstrip('/')}/{filename}" if key_prefix else filename


def main() -> None:
    parser = argparse.ArgumentParser(description="Copy remote URLs to object storage")
    parser.add_argument("urls_file", type=Path, help="Text file containing one URL per line")
    parser.add_argument("--key-prefix", default="", help="Optional storage key prefix")
    args = parser.parse_args()

    storage = get_object_storage_service()
    if not storage.available:
        raise SystemExit("对象存储未配置")

    urls = [line.strip() for line in args.urls_file.read_text(encoding="utf-8").splitlines() if line.strip()]
    success = 0
    failed = 0

    with httpx.Client(timeout=120.0, follow_redirects=True) as client:
        for url in urls:
            try:
                response = client.get(url)
                response.raise_for_status()
                content_type = response.headers.get("content-type") or mimetypes.guess_type(url)[0] or "application/octet-stream"
                key = build_key(url, args.key_prefix)
                uploaded = storage.upload_bytes(response.content, key, content_type)
                if uploaded:
                    success += 1
                else:
                    failed += 1
                    print(f"FAILED upload {url}")
            except Exception as exc:
                failed += 1
                print(f"FAILED {url}: {exc}")

    print(f"done success={success} failed={failed}")


if __name__ == "__main__":
    main()
