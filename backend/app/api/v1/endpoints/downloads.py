import asyncio
import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.job import Job, JobStatus, JobType
from app.models.user import User
from app.schemas.job import DownloadCreate, DownloadInspectCreate, DownloadInspectOut, JobOut
from app.services.admin_events import log_event
from app.services.downloader import ytdlp_service
from app.workers import job_engine

router = APIRouter(prefix="/downloads", tags=["downloads"])


@router.post("", response_model=JobOut | list[JobOut], status_code=status.HTTP_202_ACCEPTED)
async def create_download(
    payload: DownloadCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JobOut | list[JobOut]:
    if payload.media_type not in {"audio", "video"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "media_type must be 'audio' or 'video'")
    if payload.audio_format not in ytdlp_service.AUDIO_FORMATS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unsupported audio_format")
    if payload.video_quality not in ytdlp_service.VIDEO_QUALITIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unsupported video_quality")

    legacy_single_response = payload._legacy_single_response
    assert payload.urls
    try:
        validated_urls = await asyncio.gather(
            *(asyncio.to_thread(ytdlp_service.validate_media_url, url) for url in payload.urls)
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None
    jobs: list[Job] = []
    for url in validated_urls:
        worker_payload = {
            "kind": "url",
            "url": url,
            "media_type": payload.media_type,
            "audio_format": payload.audio_format,
            "video_quality": payload.video_quality,
            "download_playlist": payload.download_playlist,
        }
        job = Job(
            user_id=current_user.id,
            job_type=JobType.DOWNLOAD,
            source_url=url,
            request_payload=json.dumps(worker_payload),
            priority=max(-10, min(10, payload.priority)),
        )
        db.add(job)
        jobs.append(job)
        await log_event(db, "job_created", user_id=current_user.id, detail=f"download: {url}")
    await db.commit()
    for job in jobs:
        await db.refresh(job)

    for job in jobs:
        background_tasks.add_task(
            job_engine.run_download_job,
            job.id,
            current_user.id,
            job.source_url,
            payload.media_type,
            payload.audio_format,
            payload.video_quality,
            payload.download_playlist,
        )

    output = [JobOut.model_validate(job) for job in jobs]
    return output[0] if legacy_single_response else output


@router.post("/inspect", response_model=DownloadInspectOut)
async def inspect_download(
    payload: DownloadInspectCreate,
    _current_user: User = Depends(get_current_user),
) -> DownloadInspectOut:
    try:
        url = await asyncio.to_thread(ytdlp_service.validate_media_url, payload.url)
        inspection = await asyncio.to_thread(ytdlp_service.inspect_url, url)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None
    except Exception as exc:  # noqa: BLE001 - convert provider text before returning it
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            job_engine.clean_job_error(exc, "That link could not be inspected."),
        ) from None
    return DownloadInspectOut(
        url=url,
        is_playlist=inspection.is_playlist,
        playlist_title=inspection.playlist_title,
        entry_count=inspection.entry_count,
    )


@router.get("", response_model=list[JobOut])
async def list_downloads(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[JobOut]:
    result = await db.scalars(
        select(Job)
        .where(Job.user_id == current_user.id, Job.job_type == JobType.DOWNLOAD)
        .options(selectinload(Job.result_media))
        .order_by(Job.created_at.desc())
        .limit(100)
    )
    return [JobOut.model_validate(job) for job in result.all()]


@router.get("/{job_id}", response_model=JobOut)
async def get_download(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JobOut:
    job = await db.get(Job, job_id, options=[selectinload(Job.result_media)])
    if job is None or job.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return JobOut.model_validate(job)


@router.delete("/{job_id}", response_model=JobOut)
async def cancel_download(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JobOut:
    job = await db.get(Job, job_id, options=[selectinload(Job.result_media)])
    if job is None or job.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")

    if job.status in {JobStatus.PENDING, JobStatus.IN_PROGRESS}:
        job_engine.request_cancellation(job_id)
        job.status = JobStatus.CANCELLED
        job.stage_label = "cancelling"
        await db.commit()
        await db.refresh(job)

    return JobOut.model_validate(job)


@router.post("/{job_id}/retry", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
async def retry_download(
    job_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JobOut:
    previous = await db.get(Job, job_id)
    if previous is None or previous.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    if previous.status not in {JobStatus.FAILED, JobStatus.CANCELLED}:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only failed or cancelled jobs can be retried")
    try:
        payload = json.loads(previous.request_payload or "")
    except (TypeError, ValueError):
        raise HTTPException(status.HTTP_409_CONFLICT, "This older job has no retry information") from None

    retry = Job(
        user_id=current_user.id,
        job_type=JobType.DOWNLOAD,
        source_url=previous.source_url,
        request_payload=previous.request_payload,
        attempt_count=previous.attempt_count + 1,
        priority=previous.priority,
    )
    db.add(retry)
    await db.commit()
    await db.refresh(retry)
    if payload.get("kind") == "url":
        background_tasks.add_task(
            job_engine.run_download_job,
            retry.id,
            current_user.id,
            payload["url"],
            payload["media_type"],
            payload.get("audio_format", "mp3-192"),
            payload.get("video_quality", "1080p"),
            payload.get("download_playlist", False),
        )
    elif payload.get("kind") == "telegram":
        background_tasks.add_task(
            job_engine.run_telegram_import_job,
            retry.id,
            current_user.id,
            payload["chat_refs"],
            payload["media_kind"],
            payload.get("limit"),
        )
    else:
        await db.delete(retry)
        await db.commit()
        raise HTTPException(status.HTTP_409_CONFLICT, "This job type cannot be retried")
    return JobOut.model_validate(retry)
