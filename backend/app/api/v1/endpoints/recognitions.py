import asyncio
import json
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.job import Job, JobStatus, JobType
from app.models.media import Media, MediaType
from app.models.user import User
from app.schemas.job import JobOut
from app.schemas.recognition import RecognitionCapabilities
from app.services.recognition import service as recognition_service
from app.services.recognition.types import RecognitionMode
from app.workers import job_engine

router = APIRouter(prefix="/recognitions", tags=["recognitions"])

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # a mic/clip sample, not a full song library
UPLOAD_CHUNK_BYTES = 1024 * 1024


async def _stage_recognition_upload(file: UploadFile) -> Path:
    """Copy an upload to a bounded temporary file without buffering it all.

    Starlette may spool multipart bodies to disk, but calling ``read()`` with
    no limit still materializes the whole clip in process memory.  Fixed-size
    reads keep memory bounded and let us reject oversized input before a Job
    row exists.
    """
    suffix = Path(file.filename or "clip.m4a").suffix.lower()
    if not (1 < len(suffix) <= 10 and suffix[1:].isalnum()):
        suffix = ".m4a"

    upload_dir = settings.media_storage_dir / "_tmp"
    upload_dir.mkdir(parents=True, exist_ok=True)
    audio_path = upload_dir / f"recognize_upload_{uuid.uuid4()}{suffix}"
    total_bytes = 0

    try:
        async with aiofiles.open(audio_path, "wb") as destination:
            while chunk := await file.read(UPLOAD_CHUNK_BYTES):
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Clip too large")
                await destination.write(chunk)
    except BaseException:
        audio_path.unlink(missing_ok=True)
        raise

    return audio_path


@router.post("", response_model=JobOut, status_code=status.HTTP_200_OK)
async def recognize(
    file: UploadFile | None = File(None),
    media_id: str | None = Form(None),
    recognition_mode: RecognitionMode = Form(RecognitionMode.RECORDING),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JobOut:
    if (file is None) == (media_id is None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Provide exactly one of: file, media_id")
    if recognition_mode == RecognitionMode.HUMMING:
        if media_id is not None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Humming recognition requires a recorded audio clip, not a library media item",
            )
        if not recognition_service.humming_recognition_available():
            # Reject before staging the upload or creating a misleading
            # no-match Job. The capabilities endpoint lets clients disable
            # this mode proactively, but the API remains authoritative.
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Humming recognition is unavailable because ACRCloud is not configured",
            )

    if media_id is not None:
        media = await db.scalar(select(Media).where(Media.id == media_id, Media.user_id == current_user.id))
        if media is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Media not found")
        audio_path = Path(media.file_path)
        cleanup = False  # this is the permanent library file, don't delete it
    else:
        # The exactly-one check above proves this to the type checker as well
        # as at runtime, while keeping the FastAPI signature optional.
        assert file is not None
        audio_path = await _stage_recognition_upload(file)
        cleanup = True

    job = Job(user_id=current_user.id, job_type=JobType.RECOGNIZE)
    db.add(job)
    try:
        await db.commit()
        await db.refresh(job)
    except BaseException:
        if cleanup:
            audio_path.unlink(missing_ok=True)
        await db.rollback()
        raise
    job_id = job.id

    try:
        await asyncio.wait_for(
            job_engine.run_recognition_job(
                job_id,
                current_user.id,
                audio_path,
                media_id,
                cleanup=cleanup,
                recognition_mode=recognition_mode,
            ),
            timeout=settings.recognition_timeout_seconds,
        )
    except asyncio.TimeoutError:
        job.status = JobStatus.FAILED
        job.error_message = "Recognition timed out"
        await db.commit()
    finally:
        # run_recognition_job already removes ad-hoc clips in its own finally;
        # this idempotent fallback covers cancellation before its body starts
        # and keeps alternate/test workers from leaking staged files.
        if cleanup:
            audio_path.unlink(missing_ok=True)

    # run_recognition_job persisted its updates through its own DB session, so
    # this session's identity-mapped copy of `job` is stale — force a reload.
    db.expire_all()
    job = await db.get(Job, job_id)
    await db.refresh(job, attribute_names=["result_media"])
    return JobOut.model_validate(job)


@router.post("/library", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
async def recognize_library(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JobOut:
    """Queue one durable job that names every eligible audio track in chunks."""
    active = await db.scalar(
        select(Job)
        .where(
            Job.user_id == current_user.id,
            Job.job_type == JobType.RECOGNIZE,
            Job.source_url == "library",
            Job.status.in_([JobStatus.PENDING, JobStatus.IN_PROGRESS]),
        )
        .options(selectinload(Job.result_media))
        .order_by(Job.created_at.desc())
    )
    if active is not None:
        return JobOut.model_validate(active)

    total = int(
        await db.scalar(
            select(func.count(Media.id)).where(
                Media.user_id == current_user.id,
                Media.media_type == MediaType.AUDIO,
                Media.recognized_title.is_(None),
            )
        )
        or 0
    )
    job = Job(
        user_id=current_user.id,
        job_type=JobType.RECOGNIZE,
        status=JobStatus.COMPLETE if total == 0 else JobStatus.PENDING,
        progress_pct=100 if total == 0 else 0,
        stage_label=f"Named 0 of {total}",
        source_url="library",
        request_payload=json.dumps({"kind": "recognition_library"}),
        batch_total=total,
        batch_processed=0,
        batch_matched=0,
        batch_failed=0,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    if total:
        background_tasks.add_task(
            job_engine.run_library_recognition_job,
            job.id,
            current_user.id,
        )
    return JobOut.model_validate(job)


@router.get("/capabilities", response_model=RecognitionCapabilities)
async def recognition_capabilities(
    _current_user: User = Depends(get_current_user),
) -> RecognitionCapabilities:
    humming = recognition_service.humming_recognition_available()
    return RecognitionCapabilities(
        recording=True,
        humming=humming,
        humming_provider="acrcloud" if humming else None,
    )


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
