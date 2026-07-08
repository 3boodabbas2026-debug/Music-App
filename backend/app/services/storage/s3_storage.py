"""S3-compatible (e.g. Cloudflare R2) media storage.

Same small interface as local_storage (adopt/delete), plus a presigned-URL
generator the streaming endpoint uses to hand playback off directly to the
object store — R2's zero-egress-fee bucket serves the audio/video bytes
instead of this free-tier compute instance.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path

import boto3
from botocore.client import Config as BotoConfig

from app.core.config import settings


@dataclass
class StoredFile:
    key: str
    size_bytes: int


def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
        region_name=settings.s3_region,
        config=BotoConfig(signature_version="s3v4"),
    )


def adopt_file(user_id: str, source_path: Path, suffix: str) -> StoredFile:
    """Upload a file produced in a temp/download dir into the bucket, then drop the local copy."""
    size = source_path.stat().st_size
    key = f"{user_id}/{uuid.uuid4()}{suffix}"
    _client().upload_file(str(source_path), settings.s3_bucket, key)
    source_path.unlink(missing_ok=True)
    return StoredFile(key=key, size_bytes=size)


def delete_file(key: str) -> None:
    _client().delete_object(Bucket=settings.s3_bucket, Key=key)


def presigned_url(key: str, content_type: str, expires_seconds: int = 21600) -> str:
    """A time-limited direct link to the object — good for one long playback session."""
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key, "ResponseContentType": content_type},
        ExpiresIn=expires_seconds,
    )
