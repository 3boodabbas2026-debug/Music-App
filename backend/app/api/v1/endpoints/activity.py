from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.media import Media
from app.models.media_state import MediaState
from app.models.user import User
from app.schemas.media import MediaOut

router = APIRouter(prefix="/activity", tags=["activity"])


class PlaybackUpdate(BaseModel):
    position_seconds: float | None = Field(default=None, ge=0)
    increment_play_count: bool = False
    favorite: bool | None = None


class MediaStateOut(BaseModel):
    media: MediaOut
    favorite: bool
    last_position_seconds: float
    play_count: int
    last_played_at: datetime | None


async def _owned(media_id: str, user_id: str, db: AsyncSession) -> Media:
    media = await db.get(Media, media_id)
    if media is None or media.user_id != user_id:
        raise HTTPException(404, "Media not found")
    return media


@router.put("/media/{media_id}", response_model=MediaStateOut)
async def update_media_state(
    media_id: str,
    payload: PlaybackUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MediaStateOut:
    media = await _owned(media_id, current_user.id, db)
    state = await db.scalar(
        select(MediaState).where(MediaState.user_id == current_user.id, MediaState.media_id == media_id)
    )
    if state is None:
        state = MediaState(user_id=current_user.id, media_id=media_id)
        db.add(state)
    if payload.position_seconds is not None:
        state.last_position_seconds = min(
            payload.position_seconds, media.duration_seconds or payload.position_seconds
        )
        state.last_played_at = datetime.now(timezone.utc)
    if payload.increment_play_count:
        state.play_count += 1
    if payload.favorite is not None:
        state.favorite = payload.favorite
    await db.commit()
    await db.refresh(state)
    return MediaStateOut(media=MediaOut.model_validate(media), **{
        "favorite": state.favorite,
        "last_position_seconds": state.last_position_seconds,
        "play_count": state.play_count,
        "last_played_at": state.last_played_at,
    })


@router.get("/continue", response_model=list[MediaStateOut])
async def continue_playing(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MediaStateOut]:
    rows = (await db.execute(
        select(MediaState, Media)
        .join(Media, Media.id == MediaState.media_id)
        .where(
            MediaState.user_id == current_user.id,
            MediaState.last_position_seconds > 0,
            (Media.duration_seconds.is_(None)) | (MediaState.last_position_seconds < Media.duration_seconds * 0.95),
        )
        .order_by(MediaState.last_played_at.desc())
        .limit(min(max(limit, 1), 100))
    )).all()
    return [MediaStateOut(
        media=MediaOut.model_validate(media), favorite=state.favorite,
        last_position_seconds=state.last_position_seconds, play_count=state.play_count,
        last_played_at=state.last_played_at,
    ) for state, media in rows]


@router.get("/favorites", response_model=list[MediaStateOut])
async def favorites(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[MediaStateOut]:
    rows = (await db.execute(
        select(MediaState, Media).join(Media).where(MediaState.user_id == current_user.id, MediaState.favorite.is_(True))
        .order_by(MediaState.updated_at.desc())
    )).all()
    return [MediaStateOut(media=MediaOut.model_validate(m), favorite=s.favorite,
        last_position_seconds=s.last_position_seconds, play_count=s.play_count, last_played_at=s.last_played_at)
        for s, m in rows]
