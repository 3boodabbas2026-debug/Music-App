import re
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_stream_user
from app.db.session import get_db
from app.models.media import Media
from app.models.user import User
from app.schemas.media import MediaOut, MediaUpdate
from app.services.storage import local_storage

router = APIRouter(prefix="/library", tags=["library"])

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
    await db.commit()
    await db.refresh(media)
    return MediaOut.model_validate(media)


@router.delete("/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    media_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> None:
    media = await _get_owned_media(media_id, current_user, db)
    local_storage.delete_file(media.file_path)
    await db.delete(media)
    await db.commit()


@router.get("/{media_id}/stream")
async def stream_media(
    media_id: str,
    request: Request,
    current_user: User = Depends(get_stream_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    media = await _get_owned_media(media_id, current_user, db)
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
