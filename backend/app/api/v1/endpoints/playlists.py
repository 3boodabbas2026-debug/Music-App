from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.media import Media
from app.models.playlist import Playlist, PlaylistItem
from app.models.user import User
from app.schemas.media import MediaOut
from app.schemas.playlist import PlaylistCreate, PlaylistItemAdd, PlaylistOut

router = APIRouter(prefix="/playlists", tags=["playlists"])


def _to_out(playlist: Playlist) -> PlaylistOut:
    # Built manually rather than via PlaylistOut.model_validate(playlist):
    # pydantic's from_attributes would otherwise match the "items" field name
    # straight onto Playlist.items (a list of PlaylistItem link rows, not
    # Media) and fail validation on the wrong object shape.
    return PlaylistOut(
        id=playlist.id,
        name=playlist.name,
        created_at=playlist.created_at,
        items=[MediaOut.model_validate(item.media) for item in playlist.items],
    )


@router.get("", response_model=list[PlaylistOut])
async def list_playlists(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[PlaylistOut]:
    result = await db.scalars(
        select(Playlist)
        .where(Playlist.user_id == current_user.id)
        .options(selectinload(Playlist.items).selectinload(PlaylistItem.media))
        .order_by(Playlist.created_at.desc())
    )
    return [_to_out(p) for p in result.all()]


@router.post("", response_model=PlaylistOut, status_code=status.HTTP_201_CREATED)
async def create_playlist(
    payload: PlaylistCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> PlaylistOut:
    playlist = Playlist(user_id=current_user.id, name=payload.name)
    db.add(playlist)
    await db.commit()
    await db.refresh(playlist, attribute_names=["items"])
    return _to_out(playlist)


@router.post("/{playlist_id}/items", response_model=PlaylistOut)
async def add_item(
    playlist_id: str,
    payload: PlaylistItemAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlaylistOut:
    playlist = await db.get(Playlist, playlist_id, options=[selectinload(Playlist.items)])
    if playlist is None or playlist.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Playlist not found")

    media = await db.get(Media, payload.media_id)
    if media is None or media.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Media not found")

    next_position = await db.scalar(
        select(func.count()).select_from(PlaylistItem).where(PlaylistItem.playlist_id == playlist_id)
    )
    db.add(PlaylistItem(playlist_id=playlist_id, media_id=media.id, position=next_position or 0))
    await db.commit()

    # `playlist.items` was already loaded (as empty) earlier in this session.
    # db.get() would return that same cached, now-stale collection even with
    # fresh options attached — populate_existing forces a real requery that
    # overwrites it.
    stmt = (
        select(Playlist)
        .where(Playlist.id == playlist_id)
        .options(selectinload(Playlist.items).selectinload(PlaylistItem.media))
        .execution_options(populate_existing=True)
    )
    refreshed = await db.scalar(stmt)
    return _to_out(refreshed)


@router.delete("/{playlist_id}/items/{media_id}", response_model=PlaylistOut)
async def remove_item(
    playlist_id: str,
    media_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlaylistOut:
    playlist = await db.get(Playlist, playlist_id)
    if playlist is None or playlist.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Playlist not found")

    items = (
        await db.scalars(
            select(PlaylistItem)
            .where(PlaylistItem.playlist_id == playlist_id)
            .order_by(PlaylistItem.position)
        )
    ).all()
    remaining = [item for item in items if item.media_id != media_id]
    if len(remaining) == len(items):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Track not in playlist")

    for item in items:
        if item.media_id == media_id:
            await db.delete(item)
    for position, item in enumerate(remaining):
        item.position = position
    await db.commit()

    stmt = (
        select(Playlist)
        .where(Playlist.id == playlist_id)
        .options(selectinload(Playlist.items).selectinload(PlaylistItem.media))
        .execution_options(populate_existing=True)
    )
    refreshed = await db.scalar(stmt)
    return _to_out(refreshed)


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_playlist(
    playlist_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> None:
    playlist = await db.get(Playlist, playlist_id)
    if playlist is None or playlist.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Playlist not found")
    await db.delete(playlist)
    await db.commit()
