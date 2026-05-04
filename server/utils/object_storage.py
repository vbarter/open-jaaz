"""
通用对象存储服务。

支持：
- Cloudflare R2（推荐）
- 腾讯 COS（兼容旧配置）
- Local-only fallback
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import boto3
from botocore.config import Config as BotoConfig

try:
    from qcloud_cos import CosConfig, CosS3Client
except ImportError:  # pragma: no cover - optional dependency
    CosConfig = None
    CosS3Client = None

from log import get_logger

logger = get_logger(__name__)


VIDEO_EXTENSIONS = (".mp4", ".mov", ".avi", ".webm", ".mkv", ".flv", ".wmv")


@dataclass
class ObjectStorageConfig:
    provider: str
    public_base_url: str
    bucket: str = ""
    region: str = ""
    endpoint: str = ""
    access_key_id: str = ""
    secret_access_key: str = ""

    @property
    def is_configured(self) -> bool:
        if self.provider == "r2":
            return bool(
                self.bucket and self.endpoint and self.access_key_id and self.secret_access_key
            )
        if self.provider == "cos":
            return bool(
                self.bucket and self.region and self.access_key_id and self.secret_access_key
            )
        return False


def _join_url(base_url: str, key: str) -> str:
    base = base_url.rstrip("/")
    path = key.lstrip("/")
    return f"{base}/{path}"


def _normalize_r2_endpoint(raw_endpoint: str, bucket: str) -> tuple[str, str]:
    endpoint = (raw_endpoint or "").strip().rstrip("/")
    if not endpoint:
        return endpoint, bucket

    parsed = urlparse(endpoint)
    path = parsed.path.strip("/")
    resolved_bucket = bucket
    normalized_endpoint = endpoint

    if path and not resolved_bucket:
        resolved_bucket = path.split("/")[0]
        normalized_endpoint = endpoint[: len(endpoint) - len(path)].rstrip("/")

    return normalized_endpoint, resolved_bucket


def load_object_storage_config() -> ObjectStorageConfig:
    provider = os.getenv("OBJECT_STORAGE_PROVIDER", "auto").strip().lower()

    r2_endpoint = os.getenv("R2_ENDPOINT") or os.getenv("R2_S3_ENDPOINT") or ""
    r2_bucket = os.getenv("R2_BUCKET") or ""
    r2_endpoint, r2_bucket = _normalize_r2_endpoint(r2_endpoint, r2_bucket)
    r2_public_base_url = (
        os.getenv("R2_PUBLIC_BASE_URL")
        or os.getenv("OBJECT_STORAGE_PUBLIC_BASE_URL")
        or (_join_url(r2_endpoint, r2_bucket) if r2_endpoint and r2_bucket else "")
    )
    r2_config = ObjectStorageConfig(
        provider="r2",
        bucket=r2_bucket,
        endpoint=r2_endpoint,
        access_key_id=os.getenv("R2_ACCESS_KEY_ID", ""),
        secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY", ""),
        public_base_url=r2_public_base_url,
    )

    cos_region = os.getenv("COS_REGION", "")
    cos_bucket = os.getenv("COS_BUCKET", "magicart-user-1301698982")
    cos_public_base_url = os.getenv(
        "COS_PUBLIC_BASE_URL",
        f"https://{cos_bucket}.cos.{cos_region}.myqcloud.com" if cos_region and cos_bucket else "",
    )
    cos_config = ObjectStorageConfig(
        provider="cos",
        bucket=cos_bucket,
        region=cos_region,
        access_key_id=os.getenv("COS_SECRET_ID", ""),
        secret_access_key=os.getenv("COS_SECRET_KEY", ""),
        public_base_url=cos_public_base_url,
    )

    if provider in {"", "auto"}:
        if r2_config.is_configured:
            return r2_config
        if cos_config.is_configured:
            return cos_config
        return ObjectStorageConfig(provider="local", public_base_url="")

    if provider == "r2":
        return r2_config
    if provider == "cos":
        return cos_config
    return ObjectStorageConfig(provider="local", public_base_url="")


class BaseObjectStorageBackend:
    provider = "local"

    def upload_bytes(self, data: bytes, key: str, content_type: str) -> Optional[str]:
        raise NotImplementedError

    def get_file_url(self, key: str) -> Optional[str]:
        raise NotImplementedError


class R2StorageBackend(BaseObjectStorageBackend):
    provider = "r2"

    def __init__(self, config: ObjectStorageConfig) -> None:
        self.bucket = config.bucket
        self.public_base_url = config.public_base_url
        self.client = boto3.client(
            "s3",
            endpoint_url=config.endpoint,
            aws_access_key_id=config.access_key_id,
            aws_secret_access_key=config.secret_access_key,
            region_name="auto",
            config=BotoConfig(signature_version="s3v4"),
        )

    def upload_bytes(self, data: bytes, key: str, content_type: str) -> Optional[str]:
        try:
            self.client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
            return self.get_file_url(key)
        except Exception as exc:
            logger.error(f"❌ 上传到 Cloudflare R2 失败: {key}, error: {exc}")
            return None

    def get_file_url(self, key: str) -> Optional[str]:
        if not self.public_base_url:
            return None
        return _join_url(self.public_base_url, key)


class CosStorageBackend(BaseObjectStorageBackend):
    provider = "cos"

    def __init__(self, config: ObjectStorageConfig) -> None:
        if CosConfig is None or CosS3Client is None:
            raise RuntimeError(
                "qcloud_cos is not installed. Install the Tencent COS SDK or switch OBJECT_STORAGE_PROVIDER away from cos."
            )
        cos_config = CosConfig(
            Region=config.region,
            SecretId=config.access_key_id,
            SecretKey=config.secret_access_key,
            Token=None,
        )
        self.client = CosS3Client(cos_config)
        self.bucket = config.bucket
        self.region = config.region
        self.public_base_url = config.public_base_url

    def upload_bytes(self, data: bytes, key: str, content_type: str) -> Optional[str]:
        try:
            self.client.put_object(
                Bucket=self.bucket,
                Body=data,
                Key=key,
                ContentType=content_type,
            )
            return self.get_file_url(key)
        except Exception as exc:
            logger.error(f"❌ 上传到腾讯 COS 失败: {key}, error: {exc}")
            return None

    def get_file_url(self, key: str) -> Optional[str]:
        if not self.public_base_url:
            if not self.bucket or not self.region:
                return None
            return f"https://{self.bucket}.cos.{self.region}.myqcloud.com/{key}"
        return _join_url(self.public_base_url, key)


class ObjectStorageService:
    def __init__(self) -> None:
        self.config = load_object_storage_config()
        self.available = False
        self.provider = self.config.provider
        self.backend: Optional[BaseObjectStorageBackend] = None

        try:
            if self.config.provider == "r2" and self.config.is_configured:
                self.backend = R2StorageBackend(self.config)
                self.available = True
            elif self.config.provider == "cos" and self.config.is_configured:
                self.backend = CosStorageBackend(self.config)
                self.available = True
            else:
                logger.warning("⚠️ 对象存储未配置，将使用本地文件存储")
        except Exception as exc:
            logger.warning(f"⚠️ 对象存储初始化失败，将使用本地存储: {exc}")
            self.backend = None
            self.available = False

    @property
    def storage_type(self) -> str:
        if not self.available:
            return "local"
        return "cloudflare_r2" if self.provider == "r2" else "tencent_cos"

    def upload_bytes(self, data: bytes, key: str, content_type: str) -> Optional[str]:
        if not self.backend:
            return None
        return self.backend.upload_bytes(data, key, content_type)

    def get_file_url(self, key: str) -> Optional[str]:
        if not self.backend:
            return None
        return self.backend.get_file_url(key)

    def is_cloud_url(self, url: str) -> bool:
        if not url:
            return False
        if self.backend and self.config.public_base_url and url.startswith(self.config.public_base_url):
            return True
        return "myqcloud.com" in url or "r2.cloudflarestorage.com" in url


object_storage_service: Optional[ObjectStorageService] = None


def get_object_storage_service() -> ObjectStorageService:
    global object_storage_service
    if object_storage_service is None:
        object_storage_service = ObjectStorageService()
    return object_storage_service
