import asyncio
import logging
import re
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_stream_user
from app.db.session import get_db
from app.models.job import Job
from app.models.media import Media
from app.models.playlist import PlaylistItem
from app.models.user import User
from app.schemas.media import MediaOut, MediaUpdate
from app.services import thumbnails
from app.services.admin_events import log_event
from app.services.storage import backend as storage_backend

router = APIRouter(prefix="/library", tags=["library"])
logger = logging.getLogger(__name__)

CHUNK_SIZE = 1024 * 1024
RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")

CONTENT_TYPES = {
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
}


@router.get("", response_model=list[MediaOut])
async def list_library(
    q: str | None = None,
    media_type: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MediaOut]:
    stmt = select(Media).where(Media.user_id == current_user.id)
    if media_type:
        stmt = stmt.where(Media.media_type == media_type)
    if q:
        like = f"%{q}%"
        stmt = stmt.where((Media.title.ilike(like)) | (Media.artist.ilike(like)))
    stmt = stmt.order_by(Media.created_at.desc())

    result = await db.scalars(stmt)
    return [MediaOut.model_validate(item) for item in result.all()]


async def _get_owned_media(media_id: str, current_user: User, db: AsyncSession) -> Media:
    media = await db.get(Media, media_id)
    if media is None or media.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Media not found")
    return media


async def _commit_or_rollback(db: AsyncSession) -> None:
    """Leave the request session usable after a failed write.

    Request-scoped sessions are closed after the response, but an explicit
    rollback is still important for direct callers/tests and prevents later
    dependency work from encountering a pending-rollback session.
    """
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise


async def _delete_media_files_best_effort(file_path: str, backend: str) -> None:
    """Remove storage only after the database no longer references it.

    Database integrity is authoritative.  A transient storage outage should
    leave an orphaned object for later operational cleanup, not resurrect a DB
    row or turn a successful library deletion into a client-visible failure.
    """
    try:
        await asyncio.to_thread(storage_backend.delete_file, file_path, backend)
    except Exception:
        logger.exception("Media metadata was deleted, but storage cleanup failed")

    if backend != "local":
        return

    try:
        await asyncio.to_thread(thumbnails.thumbnail_path_for(file_path).unlink, missing_ok=True)
    except Exception:
        logger.exception("Media metadata was deleted, but thumbnail cleanup failed")


@router.get("/{media_id}", response_model=MediaOut)
async def get_media(
    media_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> MediaOut:
    media = await _get_owned_media(media_id, current_user, db)
    return MediaOut.model_validate(media)


@router.patch("/{media_id}", response_model=MediaOut)
async def update_media(
    media_id: str,
    payload: MediaUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MediaOut:
    media = await _get_owned_media(media_id, current_user, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(media, field, value)
    await _commit_or_rollback(db)
    await db.refresh(media)
    return MediaOut.model_validate(media)


@router.delete("/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    media_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> None:
    media = await _get_owned_media(media_id, current_user, db)

    # Capture storage coordinates before deleting the ORM row.  All database
    # references are resolved in the same transaction: playlist membership is
    # owned by the media row, while completed jobs remain useful history and
    # merely lose their optional result pointer.
    file_path = media.file_path
    backend = media.storage_backend or "local"
    playlist_ids = list(
        (
            await db.scalars(
                select(PlaylistItem.playlist_id)
                .where(PlaylistItem.media_id == media.id)
                .distinct()
            )
        ).all()
    )
    await db.execute(delete(PlaylistItem).where(PlaylistItem.media_id == media.id))
    if playlist_ids:
        remaining_items = (
            await db.scalars(
                select(PlaylistItem)
                .where(PlaylistItem.playlist_id.in_(playlist_ids))
                .order_by(PlaylistItem.playlist_id, PlaylistItem.position, PlaylistItem.id)
            )
        ).all()
        positions: dict[str, int] = {}
        for item in remaining_items:
            item.position = positions.get(item.playlist_id, 0)
            positions[item.playlist_id] = item.position + 1
    await db.execute(update(Job).where(Job.result_media_id == media.id).values(result_media_id=None))
    await log_event(db, "media_deleted", user_id=current_user.id, detail=media.title or media.id)
    await db.delete(media)
    await _commit_or_rollback(db)

    # Never destroy the only bytes before the database transaction succeeds.
    await _delete_media_files_best_effort(file_path, backend)


@router.get("/{media_id}/thumbnail", include_in_schema=False)
async def media_thumbnail(media_id: str, db: AsyncSession = Depends(get_db)) -> FileResponse:
    """Serves the ffmpeg-generated poster frame for a video. Deliberately
    unauthenticated: <img> tags can't send Authorization headers, media ids
    are unguessable UUIDs, and external thumbnail_urls (YouTube's CDN etc.)
    are public in exactly the same way."""
    media = await db.get(Media, media_id)
    if media is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Media not found")
    thumb = thumbnails.thumbnail_path_for(media.file_path)
    if not thumb.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No thumbnail")
    return FileResponse(thumb, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/{media_id}/stream")
async def stream_media(
    media_id: str,
    request: Request,
    proxy: bool = False,
    current_user: User = Depends(get_stream_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    media = await _get_owned_media(media_id, current_user, db)

    if media.storage_backend == "s3":
        content_type = CONTENT_TYPES.get(Path(media.file_path).suffix.lower(), "application/octet-stream")

        if proxy:
            # The PWA's "save offline" path downloads with browser fetch(),
            # which can't follow the presigned redirect: the bucket sends no
            # CORS headers, so the cross-origin response is blocked. Relay the
            # bytes through this origin instead. Playback never uses this —
            # it's a one-shot full download, so no Range support needed.
            body, size = await asyncio.to_thread(storage_backend.open_object, media.file_path)

            async def s3_iterator():
                try:
                    while True:
                        chunk = await asyncio.to_thread(body.read, CHUNK_SIZE)
                        if not chunk:
                            break
                        yield chunk
                finally:
                    await asyncio.to_thread(body.close)

            return StreamingResponse(
                s3_iterator(),
                media_type=content_type,
                headers={"Content-Length": str(size), "Accept-Ranges": "none"},
            )

        # Hand playback straight to the bucket — R2's zero-egress-fee storage
        # streams the bytes, not this free-tier compute instance. The browser
        # (or native player) follows the redirect and range-requests the
        # presigned URL directly, same as it would any other media URL.
        url = await asyncio.to_thread(storage_backend.presigned_url, media.file_path, content_type)
        return RedirectResponse(url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    path = Path(media.file_path)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Underlying file is missing")

    file_size = path.stat().st_size
    content_type = CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")

    range_header = request.headers.get("range")
    start, end = 0, file_size - 1
    status_code = status.HTTP_200_OK

    if range_header:
        match = RANGE_RE.match(range_header)
        if not match:
            raise HTTPException(status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE, "Malformed Range header")
        start = int(match.group(1)) if match.group(1) else 0
        end = int(match.group(2)) if match.group(2) else file_size - 1
        end = min(end, file_size - 1)
        if start > end:
            raise HTTPException(status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE, "Invalid range")
        status_code = status.HTTP_206_PARTIAL_CONTENT

    async def iterator():
        async with aiofiles.open(path, "rb") as f:
            await f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = await f.read(min(CHUNK_SIZE, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
    }
    return StreamingResponse(iterator(), status_code=status_code, media_type=content_type, headers=headers)
