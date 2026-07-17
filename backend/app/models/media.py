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
    # A provider thumbnail is downloaded once and adopted into the same
    # durable storage backend as the media.  thumbnail_url then points at our
    # stable serving endpoint instead of making every client re-fetch a
    # third-party CDN URL.
    artwork_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    artwork_mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    recognized_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recognized_artist: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Auto-filled from the same Shazam match that resolves recognized_title —
    # genre/release_year come straight from Shazam's metadata; is_remix is a
    # cheap title-keyword heuristic (see job_engine._looks_like_remix), not a
    # field Shazam provides directly.
    genre: Mapped[str | None] = mapped_column(String(100), nullable=True)
    release_year: Mapped[int | None] = mapped_column(nullable=True)
    is_remix: Mapped[bool | None] = mapped_column(nullable=True)
    # Milliseconds of genuine silence at the very start/end, from ffmpeg
    # silencedetect (see app.services.audio_analysis) — lets the crossfade
    # span each track's actual silence instead of one fixed duration for
    # everyone. Both null until analyzed, and stay null afterwards if none
    # was found — fades_analyzed_at is the only thing that distinguishes
    # "not analyzed yet" from "analyzed, no edge silence" (a plain "is this
    # null" check on the fade columns themselves can't tell those apart,
    # which would make the startup backfill re-scan the same tracks forever).
    fade_in_ms: Mapped[int | None] = mapped_column(nullable=True)
    fade_out_ms: Mapped[int | None] = mapped_column(nullable=True)
    fades_analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    file_path: Mapped[str] = mapped_column(Text)
    file_size_bytes: Mapped[int | None] = mapped_column(nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    original_filename: Mapped[str | None] = mapped_column(String(500), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(200), nullable=True)
    telegram_chat_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    telegram_message_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    # Which backend actually holds file_path's bytes ("local" or "s3") — set
    # once at adopt time. Per-row rather than a single global flag because
    # storage_preference lets different users' new uploads land on different
    # backends within the same deployment.
    storage_backend: Mapped[str | None] = mapped_column(String(10), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    owner: Mapped["User"] = relationship(back_populates="media_items")

    __table_args__ = (
        UniqueConstraint("user_id", "content_hash", name="uq_user_content_hash"),
        UniqueConstraint(
            "user_id", "telegram_chat_id", "telegram_message_id", name="uq_user_telegram_message"
        ),
    )

    @property
    def display_title(self) -> str:
        return self.recognized_title or self.title or "Untitled"

    @property
    def display_artist(self) -> str:
        return self.recognized_artist or self.artist or "Unknown Artist"
