from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.job import Job, JobStatus, JobType
from app.models.user import User
from app.schemas.job import DownloadCreate, JobOut
from app.services.downloader import ytdlp_service
from app.workers import job_engine

router = APIRouter(prefix="/downloads", tags=["downloads"])


@router.post("", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
async def create_download(
    payload: DownloadCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JobOut:
    if payload.media_type not in {"audio", "video"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "media_type must be 'audio' or 'video'")
    if payload.audio_format not in ytdlp_service.AUDIO_FORMATS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unsupported audio_format")
    if payload.video_quality not in ytdlp_service.VIDEO_QUALITIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unsupported video_quality")

    job = Job(user_id=current_user.id, job_type=JobType.DOWNLOAD, source_url=payload.url)
    db.add(job)
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(
        job_engine.run_download_job,
        job.id,
        current_user.id,
        payload.url,
        payload.media_type,
        payload.audio_format,
        payload.video_quality,
    )

    return JobOut.model_validate(job)


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

    return JobOut.model_validate(job)
