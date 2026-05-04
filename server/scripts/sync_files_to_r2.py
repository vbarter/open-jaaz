#!/usr/bin/env python3
"""
将本地文件批量同步到当前配置的对象存储。

适用场景：
- 将历史本地 `user_data/files`
- 将 `user_data/users/**/files`
- 将 `img2video`
中的产物补传到 R2
"""

from __future__ import annotations

import argparse
import mimetypes
import sys
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from utils.object_storage import get_object_storage_service


def iter_files(root: Path):
    for path in root.rglob("*"):
        if path.is_file():
            yield path


def upload_path(path: Path, key_prefix: str = "") -> bool:
    storage = get_object_storage_service()
    if not storage.available:
        raise RuntimeError("对象存储未配置")

    relative_name = path.name if not key_prefix else f"{key_prefix.rstrip('/')}/{path.name}"
    content_type, _ = mimetypes.guess_type(str(path))
    content_type = content_type or "application/octet-stream"
    url = storage.upload_bytes(path.read_bytes(), relative_name, content_type)
    return bool(url)


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync local files to object storage")
    parser.add_argument("root", type=Path, help="Local directory to sync")
    parser.add_argument("--key-prefix", default="", help="Optional storage key prefix")
    args = parser.parse_args()

    success = 0
    failed = 0
    for path in iter_files(args.root):
        try:
            if upload_path(path, args.key_prefix):
                success += 1
            else:
                failed += 1
        except Exception as exc:
            failed += 1
            print(f"FAILED {path}: {exc}")

    print(f"done success={success} failed={failed}")


if __name__ == "__main__":
    main()
