"""Picks local-disk or S3-compatible storage based on SMA_STORAGE_BACKEND.

Callers (job engine, library endpoint) go through this module rather than
importing local_storage/s3_storage directly, so the rest of the app doesn't
need to know or care which one is active.
"""
from __future__ import annotations

from pathlib import Path

from app.core.config import settings
from app.services.storage import local_storage, s3_storage
from app.services.storage.s3_storage import StoredFile

__all__ = ["StoredFile", "is_s3", "adopt_file", "delete_file", "presigned_url"]


def is_s3() -> bool:
    return settings.storage_backend == "s3"


def adopt_file(user_id: str, source_path: Path, suffix: str) -> StoredFile:
    """Move a file produced in a temp/download dir into permanent storage."""
    if is_s3():
        return s3_storage.adopt_file(user_id, source_path, suffix)
    permanent_path = local_storage.adopt_file(user_id, source_path, suffix)
    return StoredFile(key=str(permanent_path), size_bytes=permanent_path.stat().st_size)


def delete_file(key: str) -> None:
    if is_s3():
        s3_storage.delete_file(key)
    else:
        local_storage.delete_file(key)


def presigned_url(key: str, content_type: str) -> str:
    """Only meaningful when is_s3() — callers should branch on that first."""
    return s3_storage.presigned_url(key, content_type)
