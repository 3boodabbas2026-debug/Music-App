import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MediaType(str, enum.Enum):
    AUDIO = "audio"
    VIDEO = "video"


class MediaSource(str, enum.Enum):
    TIKTOK = "tiktok"
    YOUTUBE = "youtube"
    INSTAGRAM = "instagram"
    TELEGRAM = "telegram"
    OTHER_URL = "other_url"
    RECOGNIZED_UPLOAD = "recognized_upload"


class Media(Base):
    __tablename__ = "media"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)

    media_type: Mapped[MediaType] = mapped_column(String(20))
    source: Mapped[MediaSource] = mapped_column(String(30))
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    artist: Mapped[str | None] = mapped_column(String(255), nullable=True)
    album: Mapped[str | None] = mapped_column(String(255), nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    recognized_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recognized_artist: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Auto-filled from the same Shazam match that resolves recognized_title —
    # genre/release_year come straight from Shazam's metadata; is_remix is a
    # cheap title-keyword heuristic (see job_engine._looks_like_remix), not a
    # field Shazam provides directly.
    genre: Mapped[str | None] = mapped_column(String(100), nullable=True)
    release_year: Mapped[int | None] = mapped_column(nullable=True)
    is_remix: Mapped[bool | None] = mapped_column(nullable=True)

    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    file_path: Mapped[str] = mapped_column(Text)
    file_size_bytes: Mapped[int | None] = mapped_column(nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    owner: Mapped["User"] = relationship(back_populates="media_items")

    __table_args__ = (UniqueConstraint("user_id", "content_hash", name="uq_user_content_hash"),)

    @property
    def display_title(self) -> str:
        return self.title or self.recognized_title or "Untitled"

    @property
    def display_artist(self) -> str:
        return self.artist or self.recognized_artist or "Unknown Artist"
