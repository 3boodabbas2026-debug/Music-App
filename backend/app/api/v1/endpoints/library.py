import asyncio
import logging
import mimetypes
import re
from datetime import datetime
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from sqlalchemy import and_, delete, exists, func, not_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_stream_user
from app.db.session import get_db
from app.models.job import Job
from app.models.media import Media, MediaSource, MediaType
from app.models.media_state import MediaState
from app.models.playlist import Playlist, PlaylistItem
from app.models.user import User
from app.schemas.media import MediaOut, MediaUpdate
from app.services import thumbnails
from app.services.admin_events import log_event
from app.services.storage import backend as storage_backend
from app.services.storage import local_storage

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
    source: str | None = None,
    named: bool | None = None,
    favorite: bool | None = None,
    min_duration: float | None = None,
    max_duration: float | None = None,
    added_after: datetime | None = None,
    added_before: datetime | None = None,
    artist: str | None = None,
    playlist_id: str | None = None,
    sort_by: str = "date",
    sort_order: str = "desc",
    offset: int = 0,
    limit: int = 300,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MediaOut]:
    stmt = select(Media).where(Media.user_id == current_user.id)
    if media_type:
        if media_type not in {value.value for value in MediaType}:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid media_type filter")
        stmt = stmt.where(Media.media_type == media_type)
    if source:
        source = source.strip().lower()
        if source == "recognized":
            stmt = stmt.where(func.nullif(func.trim(Media.recognized_title), "").is_not(None))
        elif source == "uploaded":
            stmt = stmt.where(Media.source == MediaSource.RECOGNIZED_UPLOAD)
        elif source in {value.value for value in MediaSource}:
            stmt = stmt.where(Media.source == source)
        else:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid source filter")

    recognized_title = func.nullif(func.trim(Media.recognized_title), "")
    raw_title = func.nullif(func.trim(Media.title), "")
    effective_title = func.lower(func.coalesce(recognized_title, raw_title, ""))
    placeholder = effective_title.in_(("untitled", "unknown", "unknown title", "audio", "music", "track"))
    telegram_filename_noise = and_(
        recognized_title.is_(None),
        Media.source == MediaSource.TELEGRAM,
        func.length(func.coalesce(raw_title, "")) >= 16,
        ~func.coalesce(raw_title, "").like("% %"),
    )
    has_usable_name = and_(effective_title != "", not_(placeholder), not_(telegram_filename_noise))
    if named is not None:
        stmt = stmt.where(has_usable_name if named else not_(has_usable_name))

    favorite_exists = exists(
        select(MediaState.id).where(
            MediaState.user_id == current_user.id,
            MediaState.media_id == Media.id,
            MediaState.favorite.is_(True),
        )
    )
    if favorite is not None:
        stmt = stmt.where(favorite_exists if favorite else not_(favorite_exists))

    if min_duration is not None:
        if min_duration < 0:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "min_duration must be non-negative")
        stmt = stmt.where(Media.duration_seconds >= min_duration)
    if max_duration is not None:
        if max_duration < 0:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "max_duration must be non-negative")
        stmt = stmt.where(Media.duration_seconds <= max_duration)
    if min_duration is not None and max_duration is not None and min_duration > max_duration:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "min_duration exceeds max_duration")

    if added_after is not None:
        stmt = stmt.where(Media.created_at >= added_after)
    if added_before is not None:
        stmt = stmt.where(Media.created_at <= added_before)
    if added_after is not None and added_before is not None and added_after > added_before:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "added_after exceeds added_before")

    if artist:
        artist_like = f"%{artist.strip()[:200]}%"
        stmt = stmt.where(or_(Media.artist.ilike(artist_like), Media.recognized_artist.ilike(artist_like)))

    if playlist_id:
        in_playlist = exists(
            select(PlaylistItem.id)
            .join(Playlist, Playlist.id == PlaylistItem.playlist_id)
            .where(
                PlaylistItem.media_id == Media.id,
                PlaylistItem.playlist_id == playlist_id,
                Playlist.user_id == current_user.id,
            )
        )
        stmt = stmt.where(in_playlist)
    if q:
        safe_query = q.strip()[:200]
        like = f"%{safe_query}%"
        stmt = stmt.where(
            (Media.title.ilike(like))
            | (Media.artist.ilike(like))
            | (Media.album.ilike(like))
            | (Media.original_filename.ilike(like))
            | (Media.recognized_title.ilike(like))
            | (Media.recognized_artist.ilike(like))
        )
    columns = {
        "date": Media.created_at,
        "size": Media.file_size_bytes,
        "duration": Media.duration_seconds,
        "source": Media.source,
        "title": func.coalesce(Media.recognized_title, Media.title),
        "artist": func.coalesce(Media.recognized_artist, Media.artist),
        "genre": Media.genre,
        "year": Media.release_year,
    }
    sort_column = columns.get(sort_by)
    if sort_column is None or sort_order not in {"asc", "desc"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid library sort")
    stmt = stmt.order_by(sort_column.asc() if sort_order == "asc" else sort_column.desc())
    stmt = stmt.offset(max(0, offset)).limit(min(max(1, limit), 500))

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


async def _delete_media_files_best_effort(
    file_path: str, backend: str, artwork_path: str | None = None
) -> None:
    """Remove storage only after the database no longer references it.

    Database integrity is authoritative.  A transient storage outage should
    leave an orphaned object for later operational cleanup, not resurrect a DB
    row or turn a successful library deletion into a client-visible failure.
    """
    try:
        await asyncio.to_thread(storage_backend.delete_file, file_path, backend)
    except Exception:
        logger.exception("Media metadata was deleted, but storage cleanup failed")

    if artwork_path:
        try:
            await asyncio.to_thread(storage_backend.delete_file, artwork_path, backend)
        except Exception:
            logger.exception("Media metadata was deleted, but artwork cleanup failed")

    if backend != "local":
        return

    try:
        safe_path = local_storage.resolve_path(file_path)
        await asyncio.to_thread(thumbnails.thumbnail_path_for(safe_path).unlink, missing_ok=True)
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
    artwork_path = media.artwork_path
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
    await _delete_media_files_best_effort(file_path, backend, artwork_path)


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


@router.get("/{media_id}/artwork", include_in_schema=False)
async def media_artwork(media_id: str, db: AsyncSession = Depends(get_db)) -> Response:
    """Serve the persisted provider cover from the media's actual backend."""
    media = await db.get(Media, media_id)
    if media is None or not media.artwork_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No artwork")
    content_type = media.artwork_mime_type or mimetypes.guess_type(media.artwork_path)[0] or "image/jpeg"
    if media.storage_backend == "s3":
        url = await asyncio.to_thread(
            storage_backend.presigned_url, media.artwork_path, content_type
        )
        return RedirectResponse(url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    try:
        path = local_storage.resolve_path(media.artwork_path)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No artwork") from None
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No artwork")
    return FileResponse(
        path,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=2592000, immutable"},
    )


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
        content_type = CONTENT_TYPES.get(Path(media.file_path).suffix.lower()) or media.mime_type or mimetypes.guess_type(media.file_path)[0] or "application/octet-stream"

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

    try:
        path = local_storage.resolve_path(media.file_path)
    except ValueError:
        logger.error("Blocked out-of-root media path for media %s", media.id)
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Underlying file is unavailable") from None
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Underlying file is missing")

    file_size = path.stat().st_size
    content_type = CONTENT_TYPES.get(path.suffix.lower()) or media.mime_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream"

    range_header = request.headers.get("range")
    start, end = 0, file_size - 1
    status_code = status.HTTP_200_OK

    if range_header:
        match = RANGE_RE.match(range_header)
        if not match:
            raise HTTPException(status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE, "Malformed Range header")
        raw_start, raw_end = match.groups()
        if not raw_start and raw_end:
            suffix_length = int(raw_end)
            if suffix_length <= 0:
                raise HTTPException(status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE, "Invalid range")
            start = max(0, file_size - suffix_length)
            end = file_size - 1
        else:
            start = int(raw_start) if raw_start else 0
            end = int(raw_end) if raw_end else file_size - 1
        end = min(end, file_size - 1)
        if start >= file_size or start > end:
            raise HTTPException(
                status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
                "Invalid range",
                headers={"Content-Range": f"bytes */{file_size}"},
            )
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
