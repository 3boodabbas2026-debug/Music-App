"""Job execution: FastAPI BackgroundTasks + a thread per blocking call.

This is intentionally the simplest thing that works for a single-machine
deployment (matches where this project runs today). If it ever needs to
survive restarts or scale across machines, swap this module's two entry
points (run_download_job / run_recognition_job) for arq task functions —
the DB schema and API layer above don't need to change, since both already
talk in terms of Job rows, not "however the work happens to execute."
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy import select
from yt_dlp.utils import DownloadCancelled

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.job import Job, JobStatus
from app.models.media import Media, MediaSource, MediaType
from app.schemas.job import JobOut
from app.services.downloader import ytdlp_service
from app.services.recognition import shazam_service
from app.services.storage import local_storage
from app.workers.broadcaster import broadcaster

_cancelled_job_ids: set[str] = set()


def request_cancellation(job_id: str) -> None:
    """Best-effort: the running download's next progress tick will abort."""
    _cancelled_job_ids.add(job_id)


def _guess_source(url: str) -> MediaSource:
    host = urlparse(url).netloc.lower()
    if "tiktok" in host:
        return MediaSource.TIKTOK
    if "youtube" in host or "youtu.be" in host:
        return MediaSource.YOUTUBE
    if "instagram" in host:
        return MediaSource.INSTAGRAM
    return MediaSource.OTHER_URL


async def _touch_job(job_id: str, **fields) -> None:
    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None:
            return
        for key, value in fields.items():
            setattr(job, key, value)
        await session.commit()
        await session.refresh(job, attribute_names=["result_media"])
        payload = JobOut.model_validate(job).model_dump(mode="json")
        await broadcaster.publish(job_id, payload)


async def run_download_job(
    job_id: str,
    user_id: str,
    url: str,
    media_type: str,
    audio_format: str = "mp3-192",
    video_quality: str = "1080p",
) -> None:
    await _touch_job(job_id, status=JobStatus.IN_PROGRESS, stage_label="starting")

    loop = asyncio.get_running_loop()
    progress_ceiling = 0

    def on_progress(pct: int, stage: str) -> None:
        nonlocal progress_ceiling
        if job_id in _cancelled_job_ids:
            raise DownloadCancelled("Cancelled by user")
        # yt-dlp resets its per-fragment/format percentage more than once for
        # some sources (DASH audio, format probing) — a raw pass-through would
        # make a progress bar visibly jump backwards, so clamp to the max seen.
        progress_ceiling = max(progress_ceiling, pct)
        asyncio.run_coroutine_threadsafe(
            _touch_job(job_id, progress_pct=progress_ceiling, stage_label=stage), loop
        )

    tmp_dir = settings.media_storage_dir / "_tmp" / job_id
    try:
        result = await asyncio.to_thread(
            ytdlp_service.download_media, url, media_type, tmp_dir, on_progress, audio_format, video_quality
        )

        content_hash = await asyncio.to_thread(local_storage.sha1_file, result.file_path)

        async with SessionLocal() as session:
            existing = await session.scalar(
                select(Media).where(Media.user_id == user_id, Media.content_hash == content_hash)
            )
            if existing is not None:
                result.file_path.unlink(missing_ok=True)
                media_id = existing.id
            else:
                permanent_path = await asyncio.to_thread(
                    local_storage.adopt_file, user_id, result.file_path, result.file_path.suffix
                )
                media = Media(
                    user_id=user_id,
                    media_type=MediaType.AUDIO if media_type == "audio" else MediaType.VIDEO,
                    source=_guess_source(url),
                    source_url=url,
                    title=result.title,
                    artist=result.artist,
                    thumbnail_url=result.thumbnail_url,
                    duration_seconds=result.duration_seconds,
                    file_path=str(permanent_path),
                    file_size_bytes=permanent_path.stat().st_size,
                    content_hash=content_hash,
                )
                session.add(media)
                await session.commit()
                await session.refresh(media)
                media_id = media.id

        await _touch_job(
            job_id,
            status=JobStatus.COMPLETE,
            progress_pct=100,
            stage_label="complete",
            result_media_id=media_id,
        )
    except DownloadCancelled:
        await _touch_job(job_id, status=JobStatus.CANCELLED, stage_label="cancelled")
    except Exception as exc:  # noqa: BLE001 - surfaced to the client as job.error_message
        await _touch_job(job_id, status=JobStatus.FAILED, stage_label="failed", error_message=str(exc))
    finally:
        _cancelled_job_ids.discard(job_id)
        if tmp_dir.exists():
            for leftover in tmp_dir.glob("*"):
                leftover.unlink(missing_ok=True)
            tmp_dir.rmdir()


async def run_telegram_import_job(
    job_id: str,
    user_id: str,
    chat_ref: str,
    media_kind: str,
    limit: int,
) -> None:
    """Pull up to `limit` music/video files from a Telegram chat into the library."""
    from telethon.tl.types import DocumentAttributeAudio, InputMessagesFilterMusic, InputMessagesFilterVideo

    from app.models.telegram_account import TelegramAccount
    from app.services.telegram import telegram_service

    await _touch_job(job_id, status=JobStatus.IN_PROGRESS, stage_label="connecting to Telegram")

    async with SessionLocal() as session:
        account = await session.get(TelegramAccount, user_id)
    if account is None:
        await _touch_job(job_id, status=JobStatus.FAILED, stage_label="failed", error_message="Telegram is not configured")
        return

    client = telegram_service.make_client(account)
    tmp_dir = settings.media_storage_dir / "_tmp" / job_id
    tmp_dir.mkdir(parents=True, exist_ok=True)
    imported = 0
    scanned = 0
    last_media_id: str | None = None

    try:
        await client.connect()
        if not await client.is_user_authorized():
            await _touch_job(job_id, status=JobStatus.FAILED, stage_label="failed", error_message="Telegram is not linked")
            return

        ref = chat_ref.strip()
        entity = await client.get_entity(int(ref)) if ref.lstrip("-").isdigit() else await client.get_entity(ref)
        chat_title = getattr(entity, "title", None) or getattr(entity, "first_name", None) or chat_ref

        message_filter = InputMessagesFilterMusic if media_kind == "music" else InputMessagesFilterVideo
        target_type = MediaType.AUDIO if media_kind == "music" else MediaType.VIDEO
        default_ext = ".mp3" if media_kind == "music" else ".mp4"

        await _touch_job(job_id, stage_label=f"scanning {chat_title}")

        async for message in client.iter_messages(entity, filter=message_filter):
            if job_id in _cancelled_job_ids:
                await _touch_job(job_id, status=JobStatus.CANCELLED, stage_label="cancelled")
                return
            if imported >= limit:
                break
            if not message.file:
                continue
            scanned += 1

            suffix = (message.file.ext or default_ext).lower()
            tmp_path = tmp_dir / f"{message.id}{suffix}"
            try:
                await message.download_media(file=str(tmp_path))
            except Exception:  # noqa: BLE001 - skip broken messages, keep the batch going
                continue
            if not tmp_path.exists() or tmp_path.stat().st_size == 0:
                tmp_path.unlink(missing_ok=True)
                continue

            title: str | None = None
            artist: str | None = None
            duration: float | None = None
            document = getattr(message, "document", None)
            if document is not None:
                for attr in document.attributes:
                    if isinstance(attr, DocumentAttributeAudio):
                        title = attr.title or title
                        artist = attr.performer or artist
                        duration = float(attr.duration) if attr.duration else duration
            if not title:
                name = message.file.name or f"telegram_{message.id}"
                title = Path(name).stem.replace("_", " ").strip() or f"Telegram {message.id}"

            content_hash = await asyncio.to_thread(local_storage.sha1_file, tmp_path)
            async with SessionLocal() as session:
                existing = await session.scalar(
                    select(Media).where(Media.user_id == user_id, Media.content_hash == content_hash)
                )
                if existing is not None:
                    tmp_path.unlink(missing_ok=True)
                    last_media_id = existing.id
                else:
                    permanent_path = await asyncio.to_thread(local_storage.adopt_file, user_id, tmp_path, suffix)
                    media = Media(
                        user_id=user_id,
                        media_type=target_type,
                        source=MediaSource.TELEGRAM,
                        source_url=f"telegram:{chat_title}",
                        title=title,
                        artist=artist,
                        duration_seconds=duration,
                        file_path=str(permanent_path),
                        file_size_bytes=permanent_path.stat().st_size,
                        content_hash=content_hash,
                    )
                    session.add(media)
                    await session.commit()
                    await session.refresh(media)
                    last_media_id = media.id

            imported += 1
            await _touch_job(
                job_id,
                progress_pct=min(99, int(imported / limit * 100)),
                stage_label=f"{imported} of up to {limit} from {chat_title}",
            )

        await _touch_job(
            job_id,
            status=JobStatus.COMPLETE,
            progress_pct=100,
            stage_label=f"imported {imported} file{'s' if imported != 1 else ''}",
            result_media_id=last_media_id,
        )
    except Exception as exc:  # noqa: BLE001 - surfaced to the client as job.error_message
        await _touch_job(job_id, status=JobStatus.FAILED, stage_label="failed", error_message=str(exc))
    finally:
        _cancelled_job_ids.discard(job_id)
        await client.disconnect()
        if tmp_dir.exists():
            for leftover in tmp_dir.glob("*"):
                leftover.unlink(missing_ok=True)
            tmp_dir.rmdir()


async def run_recognition_job(
    job_id: str,
    user_id: str,
    tmp_audio_path: Path,
    existing_media_id: str | None,
    cleanup: bool = True,
) -> None:
    await _touch_job(job_id, status=JobStatus.IN_PROGRESS, stage_label="listening")
    try:
        match = await shazam_service.recognize_file(tmp_audio_path)

        if match is None:
            await _touch_job(job_id, status=JobStatus.COMPLETE, progress_pct=100, stage_label="no_match")
            return

        if existing_media_id:
            async with SessionLocal() as session:
                media = await session.get(Media, existing_media_id)
                if media is not None and media.user_id == user_id:
                    media.recognized_title = match.title
                    media.recognized_artist = match.artist
                    if not media.thumbnail_url:
                        media.thumbnail_url = match.thumbnail_url
                    await session.commit()

            await _touch_job(
                job_id,
                status=JobStatus.COMPLETE,
                progress_pct=100,
                stage_label="matched",
                result_media_id=existing_media_id,
                match_title=match.title,
                match_artist=match.artist,
                match_thumbnail_url=match.thumbnail_url,
            )
        else:
            # Ad-hoc mic/file recognition: report the match, don't clutter the
            # library with the short recognition clip itself.
            await _touch_job(
                job_id,
                status=JobStatus.COMPLETE,
                progress_pct=100,
                stage_label="matched",
                match_title=match.title,
                match_artist=match.artist,
                match_thumbnail_url=match.thumbnail_url,
            )
    except Exception as exc:  # noqa: BLE001
        await _touch_job(job_id, status=JobStatus.FAILED, stage_label="failed", error_message=str(exc))
    finally:
        if cleanup:
            tmp_audio_path.unlink(missing_ok=True)
