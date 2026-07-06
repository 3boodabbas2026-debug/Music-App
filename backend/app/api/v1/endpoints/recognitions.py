import asyncio
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.job import Job, JobStatus, JobType
from app.models.media import Media, MediaType
from app.models.user import User
from app.schemas.job import JobOut
from app.workers import job_engine

router = APIRouter(prefix="/recognitions", tags=["recognitions"])

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # a mic/clip sample, not a full song library
MAX_BATCH_TRACKS = 25  # cap one batch pass; the client can call again for the rest


@router.post("", response_model=JobOut, status_code=status.HTTP_200_OK)
async def recognize(
    file: UploadFile | None = File(None),
    media_id: str | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JobOut:
    if (file is None) == (media_id is None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Provide exactly one of: file, media_id")

    job = Job(user_id=current_user.id, job_type=JobType.RECOGNIZE)
    db.add(job)
    await db.commit()
    await db.refresh(job)
    job_id = job.id

    cleanup = True
    if media_id is not None:
        media = await db.get(Media, media_id)
        if media is None or media.user_id != current_user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Media not found")
        audio_path = Path(media.file_path)
        cleanup = False  # this is the permanent library file, don't delete it
    else:
        suffix = Path(file.filename or "clip.m4a").suffix or ".m4a"
        audio_path = settings.media_storage_dir / "_tmp" / f"recognize_{job_id}{suffix}"
        audio_path.parent.mkdir(parents=True, exist_ok=True)
        body = await file.read()
        if len(body) > MAX_UPLOAD_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Clip too large")
        audio_path.write_bytes(body)

    try:
        await asyncio.wait_for(
            job_engine.run_recognition_job(
                job_id, current_user.id, audio_path, media_id, cleanup=cleanup
            ),
            timeout=settings.recognition_timeout_seconds,
        )
    except asyncio.TimeoutError:
        job.status = JobStatus.FAILED
        job.error_message = "Recognition timed out"
        await db.commit()

    # run_recognition_job persisted its updates through its own DB session, so
    # this session's identity-mapped copy of `job` is stale — force a reload.
    db.expire_all()
    job = await db.get(Job, job_id)
    await db.refresh(job, attribute_names=["result_media"])
    return JobOut.model_validate(job)


@router.post("/library", response_model=list[JobOut], status_code=status.HTTP_202_ACCEPTED)
async def recognize_library(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[JobOut]:
    """Batch-name the library: queue recognition for every audio track that has
    no recognized title yet (capped per call). Jobs run sequentially in the
    background; progress streams over the normal per-job websocket."""
    result = await db.scalars(
        select(Media)
        .where(
            Media.user_id == current_user.id,
            Media.media_type == MediaType.AUDIO,
            Media.recognized_title.is_(None),
        )
        .order_by(Media.created_at.desc())
        .limit(MAX_BATCH_TRACKS)
    )
    pending = result.all()

    jobs: list[JobOut] = []
    for media in pending:
        job = Job(user_id=current_user.id, job_type=JobType.RECOGNIZE)
        db.add(job)
        await db.commit()
        await db.refresh(job)
        background_tasks.add_task(
            job_engine.run_recognition_job,
            job.id,
            current_user.id,
            Path(media.file_path),
            media.id,
            False,
        )
        jobs.append(JobOut.model_validate(job))
    return jobs


@router.get("/{job_id}", response_model=JobOut)
async def get_recognition(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JobOut:
    # Recognition is normally resolved synchronously within the POST above;
    # this exists for a client that got disconnected mid-request and needs to
    # check the outcome after the fact.
    job = await db.get(Job, job_id, options=[selectinload(Job.result_media)])
    if job is None or job.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return JobOut.model_validate(job)
