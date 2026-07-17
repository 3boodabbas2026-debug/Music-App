from datetime import datetime

import re

from pydantic import BaseModel, Field, PrivateAttr, model_validator

from app.models.job import JobStatus, JobType
from app.schemas.media import MediaOut


class DownloadCreate(BaseModel):
    # `url` keeps older clients working; new clients send `urls`.  Both are
    # normalized into urls so the endpoint has one unambiguous code path.
    url: str | None = None
    urls: list[str] | None = None
    media_type: str = "audio"  # "audio" | "video"
    audio_format: str = "mp3-192"  # "mp3-320" | "mp3-192" | "m4a" | "source"
    video_quality: str = "1080p"  # "2160p" | "1080p" | "720p" | "source"
    download_playlist: bool = False
    priority: int = 0
    _legacy_single_response: bool = PrivateAttr(default=False)

    @model_validator(mode="after")
    def normalize_urls(self) -> "DownloadCreate":
        self._legacy_single_response = "url" in self.model_fields_set and "urls" not in self.model_fields_set
        candidates: list[str] = []

        def split_input(value: str) -> list[str]:
            stripped = value.strip()
            # yt-dlp search expressions legitimately contain spaces in their
            # query; ordinary pasted links remain whitespace-separable.
            if stripped.casefold().startswith("ytsearch"):
                return [stripped]
            return re.split(r"\s+", stripped)

        if self.url:
            candidates.extend(split_input(self.url))
        for value in self.urls or []:
            candidates.extend(split_input(value))

        normalized = list(dict.fromkeys(value for value in candidates if value))
        if not normalized:
            raise ValueError("Provide at least one URL")
        if len(normalized) > 100:
            raise ValueError("A batch can contain at most 100 URLs")
        if any(len(value) > 4096 for value in normalized):
            raise ValueError("URL is too long")
        self.urls = normalized
        self.url = normalized[0] if len(normalized) == 1 else None
        return self


class DownloadInspectCreate(BaseModel):
    url: str = Field(min_length=1, max_length=4096)


class DownloadInspectOut(BaseModel):
    url: str
    is_playlist: bool
    playlist_title: str | None
    entry_count: int | None


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
    attempt_count: int
    priority: int
    batch_total: int | None
    batch_processed: int | None
    batch_matched: int | None
    batch_failed: int | None

    model_config = {"from_attributes": True}
