import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class JobType(str, enum.Enum):
    DOWNLOAD = "download"
    RECOGNIZE = "recognize"


class JobStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)

    job_type: Mapped[JobType] = mapped_column(String(20))
    status: Mapped[JobStatus] = mapped_column(String(20), default=JobStatus.PENDING)
    progress_pct: Mapped[int] = mapped_column(default=0)
    stage_label: Mapped[str | None] = mapped_column(String(120), nullable=True)

    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Durable worker inputs make failures retryable after process restarts.
    request_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempt_count: Mapped[int] = mapped_column(default=0)
    priority: Mapped[int] = mapped_column(default=0, index=True)

    # Aggregate counters for long-running library recognition.  Keeping them
    # on the durable Job row makes progress honest after reconnects: the UI
    # does not have to infer a batch result from a collection of transient
    # websocket subscriptions.
    batch_total: Mapped[int | None] = mapped_column(nullable=True)
    batch_processed: Mapped[int | None] = mapped_column(nullable=True)
    batch_matched: Mapped[int | None] = mapped_column(nullable=True)
    batch_failed: Mapped[int | None] = mapped_column(nullable=True)

    # A completed job is historical activity, not an ownership relationship.
    # Deleting the resulting library item must therefore keep the job and only
    # clear this optional pointer.  The endpoint also performs this update
    # explicitly for databases created before this FK policy existed.
    result_media_id: Mapped[str | None] = mapped_column(
        ForeignKey("media.id", ondelete="SET NULL"), nullable=True
    )

    # Populated for ad-hoc RECOGNIZE jobs (mic/file clip with no library media_id
    # attached) since there's no Media row to hang the match metadata off of.
    match_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    match_artist: Mapped[str | None] = mapped_column(String(255), nullable=True)
    match_thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    owner: Mapped["User"] = relationship(back_populates="jobs")
    result_media: Mapped["Media | None"] = relationship()
