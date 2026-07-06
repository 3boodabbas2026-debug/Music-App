from datetime import datetime

from pydantic import BaseModel

from app.models.job import JobStatus, JobType
from app.schemas.media import MediaOut


class DownloadCreate(BaseModel):
    url: str
    media_type: str = "audio"  # "audio" | "video"
    audio_format: str = "mp3-192"  # "mp3-320" | "mp3-192" | "m4a" | "source"
    video_quality: str = "1080p"  # "2160p" | "1080p" | "720p" | "source"


class JobOut(BaseModel):
    id: str
    job_type: JobType
    status: JobStatus
    progress_pct: int
    stage_label: str | None
    source_url: str | None
    error_message: str | None
    result_media: MediaOut | None
    match_title: str | None
    match_artist: str | None
    match_thumbnail_url: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
