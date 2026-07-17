import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Playlist(Base):
    __tablename__ = "playlists"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    # Stable identity for server-maintained playlists.  The visible name may
    # be recreated by a user, but only one automatic Telegram collection can
    # exist per account.
    system_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    owner: Mapped["User"] = relationship(back_populates="playlists")
    items: Mapped[list["PlaylistItem"]] = relationship(
        back_populates="playlist", order_by="PlaylistItem.position", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("user_id", "system_key", name="uq_user_playlist_system_key"),)


class PlaylistItem(Base):
    __tablename__ = "playlist_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    playlist_id: Mapped[str] = mapped_column(ForeignKey("playlists.id"), index=True)
    # Playlist rows are links to media, not independent records.  New
    # databases enforce the intended cleanup at the FK level; the media
    # deletion endpoint also deletes links explicitly so existing databases
    # (whose constraints are not rewritten by create_all) behave identically.
    media_id: Mapped[str] = mapped_column(ForeignKey("media.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(default=0)

    playlist: Mapped["Playlist"] = relationship(back_populates="items")
    media: Mapped["Media"] = relationship()

    __table_args__ = (UniqueConstraint("playlist_id", "media_id", name="uq_playlist_media"),)
