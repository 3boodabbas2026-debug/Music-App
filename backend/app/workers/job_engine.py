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
import mimetypes
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from yt_dlp.utils import DownloadCancelled

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.job import Job, JobStatus, JobType
from app.models.media import Media, MediaSource, MediaType
from app.models.playlist import Playlist, PlaylistItem
from app.schemas.job import JobOut
from app.services import audio_analysis, thumbnails
from app.services.downloader import ytdlp_service
from app.services.recognition import service as recognition_service
from app.services.recognition.types import RecognitionMatch, RecognitionMode
from app.services.admin_events import log_event
from app.services.storage import backend as storage_backend
from app.services.storage import local_storage
from app.workers.broadcaster import broadcaster

_cancelled_job_ids: set[str] = set()
_download_semaphore = asyncio.Semaphore(max(1, settings.max_concurrent_downloads))
# A batch can contain any number of files, but this best-effort auto-naming
# path should never create concurrent Shazam requests across import jobs.
_auto_name_semaphore = asyncio.Semaphore(1)

# One long unbroken token mixing cases and/or digits — the shape of base64
# blobs, hex hashes, and numeric IDs that Telegram/yt-dlp sometimes hand back
# as "titles" when the file has no real metadata.
_GARBAGE_TITLE_RE = re.compile(r"^[A-Za-z0-9_-]{16,}$")
_PLACEHOLDER_TITLES = {
    "untitled",
    "unknown",
    "unknown title",
    "audio",
    "music",
    "track",
}
_PLACEHOLDER_ARTISTS = {"unknown", "unknown artist", "untitled"}


def clean_job_error(error: object, fallback: str = "That job could not be completed. Try again.") -> str:
    """Convert third-party exceptions into short, safe text for clients.

    yt-dlp, Telethon and Shazam exceptions can include stack-like prefixes,
    local paths, URLs with tokens, and multi-line diagnostics. Job rows are a
    user-facing surface, so none of that belongs in `error_message`.
    """
    raw = str(error or "").strip()
    if not raw:
        return fallback
    lower = raw.lower()
    if "timed out" in lower or "timeout" in lower:
        return "The service took too long to respond. Try again."
    if "floodwait" in lower or "too many requests" in lower or "rate limit" in lower:
        return "The service is rate-limiting requests. Wait a moment and try again."
    if "not authorized" in lower or "not linked" in lower:
        return "Telegram is no longer linked. Reconnect it and try again."
    if "unsupported url" in lower:
        return "That link does not contain supported media."
    if "sign in" in lower or "cookies" in lower:
        return "The media site requires sign-in, so this link cannot be saved right now."

    first_line = raw.splitlines()[0]
    first_line = re.sub(r"^error:\s*", "", first_line, flags=re.IGNORECASE)
    first_line = re.sub(r"^\[[^\]]+\]\s*", "", first_line)
    first_line = re.sub(r"https?://\S+", "that link", first_line)
    first_line = re.sub(r"(?:[A-Za-z]:\\|/)[^\s:'\"]+", "a local file", first_line)
    first_line = re.sub(r"\s+", " ", first_line).strip(" :-")
    if not first_line:
        return fallback
    return first_line[:197] + "..." if len(first_line) > 200 else first_line


def looks_like_garbage_title(title: str | None) -> bool:
    if not title:
        return True
    t = title.strip()
    normalized = re.sub(r"\s+", " ", t).casefold()
    if normalized in _PLACEHOLDER_TITLES or re.fullmatch(r"telegram\s+\d+", normalized):
        return True
    if " " in t or not _GARBAGE_TITLE_RE.match(t):
        return False
    has_digit = any(c.isdigit() for c in t)
    # lower→upper flips mid-word ("osOCYEgY…") are the base64 signature; a
    # single capitalized real word ("Supercalifragilistic…") has none.
    case_flips = sum(1 for a, b in zip(t, t[1:]) if a.islower() and b.isupper())
    return has_digit or case_flips >= 2


def looks_like_missing_artist(artist: str | None) -> bool:
    return not artist or artist.strip().casefold() in _PLACEHOLDER_ARTISTS


# Shazam doesn't hand back a boolean "is this a remix" field — this is a
# plain keyword scan over the matched title, cheap and good enough to flag
# the common cases (title usually carries "(Remix)", "(Live)", etc.).
_REMIX_KEYWORDS_RE = re.compile(
    r"\b(remix|rmx|mashup|bootleg|edit|flip|rework|vip mix|extended mix|club mix)\b", re.IGNORECASE
)


def looks_like_remix_title(title: str | None) -> bool:
    return bool(title and _REMIX_KEYWORDS_RE.search(title))


async def fail_orphaned_jobs() -> None:
    """Jobs run as in-process BackgroundTasks, so a server restart silently
    kills any in-flight work while the Job row stays IN_PROGRESS forever
    ("Running · 16h"). Called once at startup: anything still marked
    pending/in-progress at boot can no longer be running — fail it so the
    client sees a retryable state instead of a zombie."""
    async with SessionLocal() as session:
        result = await session.scalars(
            select(Job).where(Job.status.in_([JobStatus.PENDING, JobStatus.IN_PROGRESS]))
        )
        orphaned = result.all()
        for job in orphaned:
            job.status = JobStatus.FAILED
            job.stage_label = "failed"
            job.error_message = "Interrupted by a server restart — retry to run it again."
        if orphaned:
            await session.commit()


async def ensure_video_thumbnail(media_id: str) -> None:
    """Generate a real poster frame for a video that has no usable thumbnail
    and point its thumbnail_url at our serving endpoint. No-op for a video
    stored in S3 (its bytes aren't on local disk) or when ffmpeg can't read
    the file. Checked per-media, not via the deployment default, since
    storage_preference can put this particular file on either backend."""
    async with SessionLocal() as session:
        media = await session.get(Media, media_id)
        if media is None or media.thumbnail_url or media.storage_backend == "s3":
            return
        generated = await asyncio.to_thread(thumbnails.generate_video_thumbnail, media.file_path)
        if generated is None:
            return
        media.thumbnail_url = f"/api/v1/library/{media.id}/thumbnail"
        await session.commit()


async def ensure_media_artwork(media_id: str, artwork_url: str | None) -> bool:
    """Persist one provider cover and replace its remote URL with our stable endpoint.

    Artwork enrichment is deliberately best-effort: a CDN outage must not turn
    an otherwise successful download or recognition into a failed media job.
    """
    if not artwork_url or artwork_url.startswith("/"):
        return False
    try:
        async with SessionLocal() as session:
            media = await session.get(Media, media_id)
            if media is None or media.artwork_path:
                return bool(media and media.artwork_path)
            if media.thumbnail_url and media.thumbnail_url != artwork_url:
                return False
            user_id = media.user_id
            backend = media.storage_backend or await _resolve_user_backend(media.user_id)

        with tempfile.TemporaryDirectory(prefix="sma_artwork_") as raw_dir:
            downloaded = await asyncio.to_thread(
                thumbnails.download_remote_artwork, artwork_url, Path(raw_dir)
            )
            if downloaded is None:
                return False
            local_path, mime_type = downloaded
            stored = await asyncio.to_thread(
                storage_backend.adopt_file,
                user_id,
                local_path,
                local_path.suffix,
                backend,
            )

        try:
            async with SessionLocal() as session:
                media = await session.get(Media, media_id)
                if media is None or media.artwork_path:
                    await asyncio.to_thread(storage_backend.delete_file, stored.key, backend)
                    return bool(media and media.artwork_path)
                media.artwork_path = stored.key
                media.artwork_mime_type = mime_type
                media.thumbnail_url = f"/api/v1/library/{media.id}/artwork"
                await session.commit()
        except Exception:
            await asyncio.to_thread(storage_backend.delete_file, stored.key, backend)
            raise
        return True
    except Exception:  # noqa: BLE001 - optional enrichment never fails the media job
        return False


async def backfill_video_thumbnails() -> None:
    """One-shot startup pass for videos imported before thumbnail generation
    existed. Small libraries only ever have a handful of these. Per-media S3
    videos are skipped inside ensure_video_thumbnail, not here."""
    async with SessionLocal() as session:
        result = await session.scalars(
            select(Media.id).where(Media.media_type == MediaType.VIDEO, Media.thumbnail_url.is_(None))
        )
        media_ids = list(result.all())
    for media_id in media_ids:
        await ensure_video_thumbnail(media_id)


async def analyze_track_fades(media_ids: list[str]) -> None:
    """Best-effort fade_in_ms/fade_out_ms detection so crossfade timing can
    adapt to each track's real silence instead of one fixed duration for
    everyone. Skips S3-backed media (checked per-row, not the deployment
    default) since ffmpeg needs the bytes on local disk. Always stamps
    fades_analyzed_at once attempted, even when no edge silence was found —
    that marker (not the fade values themselves) is what backfill_track_fades
    checks, so a track that was analyzed and genuinely has none isn't
    re-scanned by ffmpeg on every future startup."""
    for media_id in media_ids:
        async with SessionLocal() as session:
            media = await session.get(Media, media_id)
            if (
                media is None
                or media.fades_analyzed_at is not None
                or media.storage_backend == "s3"
                or not media.duration_seconds
            ):
                continue
            file_path = media.file_path
            duration = media.duration_seconds
        result = await asyncio.to_thread(audio_analysis.analyze_track_edges, file_path, duration)
        if result is None:
            continue
        async with SessionLocal() as session:
            media = await session.get(Media, media_id)
            if media is None:
                continue
            media.fade_in_ms = result["fade_in_ms"]
            media.fade_out_ms = result["fade_out_ms"]
            media.fades_analyzed_at = datetime.now(timezone.utc)
            await session.commit()


async def backfill_track_fades() -> None:
    """One-shot startup pass for audio imported before fade analysis
    existed. Small libraries only ever have a handful of these."""
    async with SessionLocal() as session:
        result = await session.scalars(
            select(Media.id).where(Media.media_type == MediaType.AUDIO, Media.fades_analyzed_at.is_(None))
        )
        media_ids = list(result.all())
    await analyze_track_fades(media_ids)


async def auto_name_media(user_id: str, media_ids: list[str]) -> None:
    """Enrich freshly imported media that needs a usable name or category.

    Telegram items without a genre are recognized even when their embedded
    title is readable, so the client can place them in a live smart category.
    Every eligible item is processed; the
    shared semaphore keeps Shazam work sequential even across import batches.
    Creates real Job rows so the runs show up in the Activity feed.

    Video is supported by shazam_service's existing ffmpeg fallback, which
    extracts a normalized audio-only MP3 sample with ``-vn``.

    S3-backed media is materialized only for the recognition call, then
    deleted immediately; the permanent object remains private in storage."""
    async with _auto_name_semaphore:
        for media_id in media_ids:
            async with SessionLocal() as session:
                media = await session.get(Media, media_id)
                needs_name = bool(
                    media
                    and media.recognized_title is None
                    and looks_like_garbage_title(media.title)
                )
                needs_telegram_category = bool(
                    media
                    and media.source == MediaSource.TELEGRAM
                    and not media.genre
                )
                if (
                    media is None
                    or media.media_type not in {MediaType.AUDIO, MediaType.VIDEO}
                    or not (needs_name or needs_telegram_category)
                ):
                    continue
                job = Job(user_id=user_id, job_type=JobType.RECOGNIZE, source_url=media.title)
                session.add(job)
                await session.commit()
                await session.refresh(job)
                job_id = job.id
                storage_kind = media.storage_backend
                stored_key = media.file_path
                suffix = Path(media.original_filename or media.file_path).suffix or ".bin"

            temporary_path: Path | None = None
            try:
                if storage_kind == "s3":
                    handle, raw_path = tempfile.mkstemp(prefix="sma_category_", suffix=suffix)
                    os.close(handle)
                    temporary_path = Path(raw_path)
                    await asyncio.to_thread(
                        storage_backend.copy_to_path,
                        stored_key,
                        storage_kind,
                        temporary_path,
                    )
                    file_path = temporary_path
                else:
                    file_path = Path(stored_key)
                await run_recognition_job(
                    job_id,
                    user_id,
                    file_path,
                    media_id,
                    cleanup=temporary_path is not None,
                )
            finally:
                if temporary_path is not None:
                    temporary_path.unlink(missing_ok=True)


async def _resolve_user_backend(user_id: str) -> str:
    """The storage backend a *new* file for this user should be adopted
    into, honoring their per-account override (see storage_backend.resolve_backend)."""
    from app.models.user import User

    async with SessionLocal() as session:
        preference = await session.scalar(select(User.storage_preference).where(User.id == user_id))
    return storage_backend.resolve_backend(preference)


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
        if fields.get("status") == JobStatus.FAILED:
            fields["error_message"] = clean_job_error(fields.get("error_message"))
        for key, value in fields.items():
            setattr(job, key, value)
        # Every download/telegram-import/recognition job funnels its status
        # transitions through here, so this is the one place that needs to
        # log completion/failure for the admin activity feed, rather than
        # every call site above doing it individually.
        if fields.get("status") in (JobStatus.COMPLETE, JobStatus.FAILED):
            completed = fields["status"] == JobStatus.COMPLETE
            detail = job.error_message if not completed else (job.stage_label or job.source_url)
            # job_type/status load back as plain strings (the columns are a
            # plain VARCHAR, not a native SQL enum) — not enum members, so no
            # `.value` here.
            await log_event(
                session,
                "job_completed" if completed else "job_failed",
                user_id=job.user_id,
                detail=f"{job.job_type}: {detail}" if detail else job.job_type,
            )
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
    download_playlist: bool = False,
) -> None:
    await _touch_job(job_id, status=JobStatus.PENDING, stage_label="queued")
    async with _download_semaphore:
        await _run_download_job(
            job_id, user_id, url, media_type, audio_format, video_quality, download_playlist
        )


async def _run_download_job(
    job_id: str,
    user_id: str,
    url: str,
    media_type: str,
    audio_format: str,
    video_quality: str,
    download_playlist: bool,
) -> None:
    if job_id in _cancelled_job_ids:
        await _touch_job(job_id, status=JobStatus.CANCELLED, stage_label="cancelled")
        _cancelled_job_ids.discard(job_id)
        return
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
        # Jobs may sit queued and retries reuse persisted payloads. Re-resolve
        # immediately before yt-dlp so an initially public hostname cannot
        # later rebinding-resolve into the backend's private network.
        url = await asyncio.to_thread(ytdlp_service.validate_media_url, url)
        batch = await asyncio.to_thread(
            ytdlp_service.download_media_batch,
            url,
            media_type,
            tmp_dir,
            on_progress,
            audio_format,
            video_quality,
            download_playlist,
        )
        backend = await _resolve_user_backend(user_id)
        media_ids: list[str] = []
        created_media_ids: list[str] = []
        failed_count = batch.failed_count
        for result in batch.items:
            try:
                content_hash = await asyncio.to_thread(local_storage.sha1_file, result.file_path)
                async with SessionLocal() as session:
                    existing = await session.scalar(
                        select(Media).where(Media.user_id == user_id, Media.content_hash == content_hash)
                    )
                    if existing is not None:
                        result.file_path.unlink(missing_ok=True)
                        media_id = existing.id
                    else:
                        original_filename = result.file_path.name
                        mime_type = mimetypes.guess_type(original_filename)[0]
                        stored = await asyncio.to_thread(
                            storage_backend.adopt_file,
                            user_id,
                            result.file_path,
                            result.file_path.suffix,
                            backend,
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
                            file_path=stored.key,
                            file_size_bytes=stored.size_bytes,
                            content_hash=content_hash,
                            original_filename=original_filename,
                            mime_type=mime_type,
                            storage_backend=backend,
                        )
                        session.add(media)
                        await session.commit()
                        await session.refresh(media)
                        media_id = media.id
                        created_media_ids.append(media_id)
                media_ids.append(media_id)
                if result.thumbnail_url:
                    await ensure_media_artwork(media_id, result.thumbnail_url)
            except Exception:  # noqa: BLE001 - keep successful playlist entries
                failed_count += 1
                result.file_path.unlink(missing_ok=True)

        if not media_ids:
            raise RuntimeError("No media from that URL could be saved")

        media_id = media_ids[-1]
        total_count = max(batch.total_count, len(media_ids) + failed_count)
        stage_label = "complete"
        warning: str | None = None
        if download_playlist:
            stage_label = f"downloaded {len(media_ids)} of {total_count} playlist entries"
        if failed_count:
            warning = f"{failed_count} entr{'y' if failed_count == 1 else 'ies'} could not be downloaded"

        await _touch_job(
            job_id,
            status=JobStatus.COMPLETE,
            progress_pct=100,
            stage_label=stage_label,
            error_message=warning,
            result_media_id=media_id,
        )
        if media_type == "video":
            for created_media_id in created_media_ids:
                await ensure_video_thumbnail(created_media_id)
        else:
            asyncio.create_task(analyze_track_fades(created_media_ids))
        # Fire-and-forget: naming shouldn't hold the download job's COMPLETE
        # status hostage to a slow Shazam lookup or ffmpeg probe.
        asyncio.create_task(auto_name_media(user_id, created_media_ids))
    except DownloadCancelled:
        await _touch_job(job_id, status=JobStatus.CANCELLED, stage_label="cancelled")
    except Exception as exc:  # noqa: BLE001 - cleaned before it reaches job.error_message
        await _touch_job(job_id, status=JobStatus.FAILED, stage_label="failed", error_message=clean_job_error(exc))
    finally:
        _cancelled_job_ids.discard(job_id)
        if tmp_dir.exists():
            for leftover in tmp_dir.glob("*"):
                leftover.unlink(missing_ok=True)
            tmp_dir.rmdir()


# Safety ceiling applied when the caller asks for "no limit" (bulk-folder
# imports) — without this an unbounded scan across many big channels could
# run for hours in-process (this worker is plain BackgroundTasks, not a real
# queue — see the module docstring).
_UNBOUNDED_IMPORT_CEILING = 20000

# Telethon raises FloodWaitError with a `.seconds` telling us exactly how
# long Telegram wants us to back off; anything longer than this is not worth
# blocking a single job on, so the job just gives up on that one call.
_MAX_FLOOD_WAIT_SECONDS = 300


async def ensure_telegram_playlist_item(user_id: str, media_id: str) -> None:
    """Create/adopt the dedicated Telegram playlist and append once."""
    for attempt in range(2):
        async with SessionLocal() as session:
            try:
                playlist = await session.scalar(
                    select(Playlist).where(
                        Playlist.user_id == user_id,
                        Playlist.system_key == "telegram",
                    )
                )
                if playlist is None:
                    # Preserve an existing user-visible Telegram collection by
                    # adopting it instead of creating a look-alike duplicate.
                    playlist = await session.scalar(
                        select(Playlist)
                        .where(
                            Playlist.user_id == user_id,
                            func.lower(Playlist.name) == "telegram",
                            Playlist.system_key.is_(None),
                        )
                        .order_by(Playlist.created_at, Playlist.id)
                    )
                    if playlist is None:
                        playlist = Playlist(user_id=user_id, name="Telegram", system_key="telegram")
                        session.add(playlist)
                        await session.flush()
                    else:
                        playlist.system_key = "telegram"

                exists = await session.scalar(
                    select(PlaylistItem.id).where(
                        PlaylistItem.playlist_id == playlist.id,
                        PlaylistItem.media_id == media_id,
                    )
                )
                if exists is None:
                    last_position = await session.scalar(
                        select(func.max(PlaylistItem.position)).where(
                            PlaylistItem.playlist_id == playlist.id
                        )
                    )
                    session.add(
                        PlaylistItem(
                            playlist_id=playlist.id,
                            media_id=media_id,
                            position=(last_position + 1) if last_position is not None else 0,
                        )
                    )
                await session.commit()
                return
            except IntegrityError:
                await session.rollback()
                if attempt:
                    raise


async def run_telegram_import_job(
    job_id: str,
    user_id: str,
    chat_refs: list[str],
    media_kind: str,
    limit: int | None,
) -> None:
    """Pull up to `limit` (or, if None, up to a safety ceiling) music/video
    files across one or more Telegram chats — e.g. every chat in a folder —
    into the library."""
    from telethon.errors import FloodWaitError
    from telethon.tl.types import DocumentAttributeAudio, InputMessagesFilterMusic, InputMessagesFilterVideo

    from app.models.telegram_account import TelegramAccount
    from app.services.telegram import telegram_service

    await _touch_job(job_id, status=JobStatus.PENDING, stage_label="queued")

    async with SessionLocal() as session:
        account = await session.get(TelegramAccount, user_id)
    if account is None:
        await _touch_job(job_id, status=JobStatus.FAILED, stage_label="failed", error_message="Telegram is not configured")
        return

    effective_limit = limit if limit is not None else _UNBOUNDED_IMPORT_CEILING

    client = telegram_service.make_client(account)
    tmp_dir = settings.media_storage_dir / "_tmp" / job_id
    tmp_dir.mkdir(parents=True, exist_ok=True)
    imported = 0
    last_media_id: str | None = None
    created_media_ids: list[str] = []

    await _download_semaphore.acquire()
    try:
        if job_id in _cancelled_job_ids:
            await _touch_job(job_id, status=JobStatus.CANCELLED, stage_label="cancelled")
            return
        await _touch_job(job_id, status=JobStatus.IN_PROGRESS, stage_label="connecting to Telegram")
        await client.connect()
        if not await client.is_user_authorized():
            await _touch_job(job_id, status=JobStatus.FAILED, stage_label="failed", error_message="Telegram is not linked")
            return

        # Database-backed StringSession deliberately does not carry Telethon's
        # local entity cache. Resolve numeric dialog/folder IDs against a
        # fresh listing once per import so private chats/channels still have
        # the access hashes get_entity(int) used to read from SQLite.
        resolved_chats = await telegram_service.resolve_chat_entities(client, chat_refs)

        message_filter = InputMessagesFilterMusic if media_kind == "music" else InputMessagesFilterVideo
        target_type = MediaType.AUDIO if media_kind == "music" else MediaType.VIDEO
        default_ext = ".mp3" if media_kind == "music" else ".mp4"
        backend = await _resolve_user_backend(user_id)

        for chat_ref, entity in resolved_chats:
            if imported >= effective_limit:
                break
            if job_id in _cancelled_job_ids:
                await _touch_job(job_id, status=JobStatus.CANCELLED, stage_label="cancelled")
                return

            chat_title = getattr(entity, "title", None) or getattr(entity, "first_name", None) or chat_ref

            await _touch_job(job_id, stage_label=f"scanning {chat_title}")

            message_iter = client.iter_messages(entity, filter=message_filter)
            while imported < effective_limit:
                try:
                    message = await message_iter.__anext__()
                except StopAsyncIteration:
                    break
                except FloodWaitError as exc:
                    wait_s = min(exc.seconds, _MAX_FLOOD_WAIT_SECONDS)
                    await _touch_job(job_id, stage_label=f"rate-limited by Telegram, waiting {wait_s}s")
                    await asyncio.sleep(wait_s)
                    continue

                if job_id in _cancelled_job_ids:
                    await _touch_job(job_id, status=JobStatus.CANCELLED, stage_label="cancelled")
                    return
                if not message.file:
                    continue

                suffix = (message.file.ext or default_ext).lower()
                telegram_chat_id = str(getattr(entity, "id", chat_ref))
                telegram_message_id = str(message.id)
                async with SessionLocal() as session:
                    already_imported = await session.scalar(
                        select(Media.id).where(
                            Media.user_id == user_id,
                            Media.telegram_chat_id == telegram_chat_id,
                            Media.telegram_message_id == telegram_message_id,
                        )
                    )
                if already_imported is not None:
                    last_media_id = already_imported
                    if media_kind == "music":
                        await ensure_telegram_playlist_item(user_id, already_imported)
                    continue
                tmp_path = tmp_dir / f"{chat_ref}_{message.id}{suffix}"
                try:
                    await message.download_media(file=str(tmp_path))
                except FloodWaitError as exc:
                    wait_s = min(exc.seconds, _MAX_FLOOD_WAIT_SECONDS)
                    await _touch_job(job_id, stage_label=f"rate-limited by Telegram, waiting {wait_s}s")
                    await asyncio.sleep(wait_s)
                    try:
                        await message.download_media(file=str(tmp_path))
                    except Exception:  # noqa: BLE001 - one retry, then skip this file
                        continue
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
                        stored = await asyncio.to_thread(storage_backend.adopt_file, user_id, tmp_path, suffix, backend)
                        media = Media(
                            user_id=user_id,
                            media_type=target_type,
                            source=MediaSource.TELEGRAM,
                            source_url=f"telegram:{chat_title}",
                            title=title,
                            artist=artist,
                            duration_seconds=duration,
                            file_path=stored.key,
                            file_size_bytes=stored.size_bytes,
                            content_hash=content_hash,
                            original_filename=message.file.name,
                            mime_type=getattr(message.file, "mime_type", None) or mimetypes.guess_type(tmp_path.name)[0],
                            telegram_chat_id=telegram_chat_id,
                            telegram_message_id=telegram_message_id,
                            storage_backend=backend,
                        )
                        session.add(media)
                        await session.commit()
                        await session.refresh(media)
                        last_media_id = media.id
                        created_media_ids.append(media.id)

                if media_kind == "music" and last_media_id is not None:
                    await ensure_telegram_playlist_item(user_id, last_media_id)

                imported += 1
                progress_denominator = effective_limit if limit is not None else max(imported, 1)
                await _touch_job(
                    job_id,
                    progress_pct=min(99, int(imported / progress_denominator * 100)),
                    stage_label=(
                        f"{imported}{f' of up to {effective_limit}' if limit is not None else ''}"
                        f" across {len(chat_refs)} chat{'s' if len(chat_refs) != 1 else ''}"
                    ),
                )

        await _touch_job(
            job_id,
            status=JobStatus.COMPLETE,
            progress_pct=100,
            stage_label=f"imported {imported} file{'s' if imported != 1 else ''}",
            result_media_id=last_media_id,
        )
        if media_kind == "video":
            for media_id in created_media_ids:
                await ensure_video_thumbnail(media_id)
        else:
            asyncio.create_task(analyze_track_fades(created_media_ids))
        # Telegram files are a common source of gibberish filename stems.
        # Name every eligible audio or video file in the serialized background
        # queue without holding the import job's COMPLETE status open.
        asyncio.create_task(auto_name_media(user_id, created_media_ids))
    except Exception as exc:  # noqa: BLE001 - cleaned before it reaches job.error_message
        await _touch_job(job_id, status=JobStatus.FAILED, stage_label="failed", error_message=clean_job_error(exc))
    finally:
        _cancelled_job_ids.discard(job_id)
        await client.disconnect()
        if tmp_dir.exists():
            for leftover in tmp_dir.glob("*"):
                leftover.unlink(missing_ok=True)
            tmp_dir.rmdir()
        _download_semaphore.release()


async def _recognize_existing_media(
    user_id: str,
    media_id: str,
    prepared_path: Path | None = None,
) -> RecognitionMatch | None:
    """Recognize one owned media row and atomically write back real metadata."""
    async with SessionLocal() as session:
        media = await session.get(Media, media_id)
        if media is None or media.user_id != user_id:
            raise RuntimeError("Media is no longer available")
        storage_kind = media.storage_backend or "local"
        stored_key = media.file_path
        suffix = Path(media.original_filename or stored_key).suffix or ".bin"

    temporary_path: Path | None = None
    if prepared_path is not None and prepared_path.is_file():
        file_path = prepared_path
    elif storage_kind == "s3":
        handle, raw_path = tempfile.mkstemp(prefix="sma_recognize_", suffix=suffix)
        os.close(handle)
        temporary_path = Path(raw_path)
        await asyncio.to_thread(
            storage_backend.copy_to_path, stored_key, storage_kind, temporary_path
        )
        file_path = temporary_path
    else:
        file_path = Path(stored_key)

    try:
        if not file_path.is_file():
            raise RuntimeError("The track file is missing")
        match = await asyncio.wait_for(
            recognition_service.recognize_file(file_path, RecognitionMode.RECORDING),
            timeout=settings.recognition_timeout_seconds,
        )
        if match is None:
            return None

        should_cache_artwork = False
        async with SessionLocal() as session:
            media = await session.get(Media, media_id)
            if media is None or media.user_id != user_id:
                raise RuntimeError("Media is no longer available")
            media.recognized_title = match.title
            media.recognized_artist = match.artist
            # Canonical fields are what older clients render first. Replace
            # placeholders/file-name noise but preserve a deliberate edit.
            if looks_like_garbage_title(media.title):
                media.title = match.title
            if looks_like_missing_artist(media.artist):
                media.artist = match.artist
            if not media.thumbnail_url and match.thumbnail_url:
                media.thumbnail_url = match.thumbnail_url
                should_cache_artwork = True
            if not media.album and match.album:
                media.album = match.album
            if match.genre:
                media.genre = match.genre
            if match.release_year:
                media.release_year = match.release_year
            media.is_remix = looks_like_remix_title(match.title)
            await session.commit()

        # Only missing art is filled: an existing real yt-dlp/provider cover
        # is never replaced by a later recognition candidate.
        if should_cache_artwork:
            await ensure_media_artwork(media_id, match.thumbnail_url)
        return match
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


LIBRARY_RECOGNITION_CHUNK_SIZE = 25


async def _snapshot_library_recognition_candidates(user_id: str) -> list[str]:
    """Freeze eligible IDs in bounded reads while holding the recognizer lock."""
    candidate_ids: list[str] = []
    last_id: str | None = None
    while True:
        async with SessionLocal() as session:
            stmt = (
                select(Media.id)
                .where(
                    Media.user_id == user_id,
                    Media.media_type == MediaType.AUDIO,
                    Media.recognized_title.is_(None),
                )
                .order_by(Media.id)
                .limit(LIBRARY_RECOGNITION_CHUNK_SIZE)
            )
            if last_id is not None:
                stmt = stmt.where(Media.id > last_id)
            chunk = list((await session.scalars(stmt)).all())
        if not chunk:
            return candidate_ids
        candidate_ids.extend(chunk)
        last_id = chunk[-1]


async def run_library_recognition_job(job_id: str, user_id: str) -> None:
    """Recognize the whole eligible library in bounded DB/provider chunks."""
    processed = 0
    matched = 0
    failed = 0
    total = 0
    last_match_id: str | None = None

    await _touch_job(job_id, status=JobStatus.PENDING, stage_label="waiting for recognizer")
    await _auto_name_semaphore.acquire()
    try:
        candidate_ids = await _snapshot_library_recognition_candidates(user_id)
        total = len(candidate_ids)
        if total == 0:
            await _touch_job(
                job_id,
                status=JobStatus.COMPLETE,
                progress_pct=100,
                stage_label="Named 0 of 0",
                batch_total=0,
                batch_processed=0,
                batch_matched=0,
                batch_failed=0,
            )
            return

        await _touch_job(
            job_id,
            status=JobStatus.IN_PROGRESS,
            progress_pct=0,
            stage_label=f"Named 0 of {total}",
            batch_total=total,
            batch_processed=0,
            batch_matched=0,
            batch_failed=0,
        )
        for start in range(0, total, LIBRARY_RECOGNITION_CHUNK_SIZE):
            for media_id in candidate_ids[start : start + LIBRARY_RECOGNITION_CHUNK_SIZE]:
                try:
                    match = await _recognize_existing_media(user_id, media_id)
                    if match is not None:
                        matched += 1
                        last_match_id = media_id
                except Exception:  # noqa: BLE001 - one unreadable/noisy file must not abort the library
                    failed += 1
                processed += 1
                await _touch_job(
                    job_id,
                    progress_pct=min(99, int(processed / total * 100)),
                    stage_label=f"Named {matched} of {total}",
                    batch_total=total,
                    batch_processed=processed,
                    batch_matched=matched,
                    batch_failed=failed,
                    result_media_id=last_match_id,
                )

        warning = None
        if failed:
            warning = f"{failed} track{'s' if failed != 1 else ''} could not be checked"
        await _touch_job(
            job_id,
            status=JobStatus.COMPLETE,
            progress_pct=100,
            stage_label=f"Named {matched} of {total}",
            error_message=warning,
            batch_total=total,
            batch_processed=processed,
            batch_matched=matched,
            batch_failed=failed,
            result_media_id=last_match_id,
        )
    except Exception as exc:  # noqa: BLE001 - cleaned before reaching clients
        await _touch_job(
            job_id,
            status=JobStatus.FAILED,
            stage_label=f"Named {matched} of {total}",
            error_message=clean_job_error(exc),
            batch_total=total,
            batch_processed=processed,
            batch_matched=matched,
            batch_failed=failed + 1,
        )
    finally:
        _auto_name_semaphore.release()


async def run_recognition_job(
    job_id: str,
    user_id: str,
    tmp_audio_path: Path,
    existing_media_id: str | None,
    cleanup: bool = True,
    recognition_mode: RecognitionMode = RecognitionMode.RECORDING,
) -> None:
    await _touch_job(job_id, status=JobStatus.IN_PROGRESS, stage_label="listening")
    try:
        if existing_media_id:
            match = await _recognize_existing_media(user_id, existing_media_id, tmp_audio_path)
        else:
            match = await recognition_service.recognize_file(tmp_audio_path, recognition_mode)

        if match is None:
            await _touch_job(job_id, status=JobStatus.COMPLETE, progress_pct=100, stage_label="no_match")
            return

        if existing_media_id:
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
        await _touch_job(job_id, status=JobStatus.FAILED, stage_label="failed", error_message=clean_job_error(exc))
    finally:
        if cleanup:
            tmp_audio_path.unlink(missing_ok=True)
