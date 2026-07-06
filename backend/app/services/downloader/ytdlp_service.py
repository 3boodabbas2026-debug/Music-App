"""Thin wrapper around yt-dlp. Blocking by design — callers must run it off
the event loop (e.g. via asyncio.to_thread)."""
from __future__ import annotations

import base64
import binascii
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterator, Optional

import imageio_ffmpeg
import yt_dlp
from yt_dlp.utils import DownloadError

from app.core.config import settings

ProgressCallback = Callable[[int, str], None]


@dataclass
class DownloadResult:
    file_path: Path
    title: Optional[str]
    artist: Optional[str]
    thumbnail_url: Optional[str]
    duration_seconds: Optional[float]


def _pick_output_file(out_dir: Path, video_id: str) -> Path:
    candidates = sorted(
        (p for p in out_dir.glob(f"{video_id}.*") if p.suffix not in {".part", ".ytdl"}),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        raise RuntimeError("yt-dlp finished but produced no output file")
    return candidates[0]


AUDIO_FORMATS = {"mp3-320", "mp3-192", "m4a", "source"}
VIDEO_QUALITIES = {"2160p", "1080p", "720p", "source"}


@contextmanager
def _cookies_file() -> Iterator[str | None]:
    if settings.ytdlp_cookies_file:
        cookie_path = Path(settings.ytdlp_cookies_file)
        if cookie_path.is_file():
            yield str(cookie_path)
            return
        raise RuntimeError(f"SMA_YTDLP_COOKIES_FILE does not exist: {cookie_path}")

    if not settings.ytdlp_cookies_b64:
        yield None
        return

    try:
        cookie_bytes = base64.b64decode(settings.ytdlp_cookies_b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise RuntimeError("SMA_YTDLP_COOKIES_B64 is not valid base64") from exc

    with tempfile.NamedTemporaryFile("wb", suffix=".cookies.txt", delete=True) as tmp:
        tmp.write(cookie_bytes)
        tmp.flush()
        yield tmp.name


def _friendly_download_error(exc: DownloadError) -> RuntimeError:
    message = str(exc)
    needs_cookies = "Sign in to confirm" in message or "not a bot" in message
    has_cookies = bool(settings.ytdlp_cookies_b64 or settings.ytdlp_cookies_file)
    if needs_cookies and not has_cookies:
        return RuntimeError(
            "YouTube blocked this server as a bot. Export YouTube cookies as a Netscape cookies.txt file, "
            "base64 it, then set Render env var SMA_YTDLP_COOKIES_B64 and redeploy."
        )
    return RuntimeError(message)


def download_media(
    url: str,
    media_type: str,
    out_dir: Path,
    progress_callback: Optional[ProgressCallback] = None,
    audio_format: str = "mp3-192",
    video_quality: str = "1080p",
) -> DownloadResult:
    out_dir.mkdir(parents=True, exist_ok=True)

    def hook(d: dict) -> None:
        if progress_callback is None:
            return
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            downloaded = d.get("downloaded_bytes", 0)
            # Reserve the last 10% of the bar for postprocessing (mux/extract-audio).
            pct = int(downloaded / total * 90) if total else 0
            progress_callback(pct, "downloading")
        elif d.get("status") == "finished":
            progress_callback(90, "processing")

    ydl_opts: dict = {
        "outtmpl": str(out_dir / "%(id)s.%(ext)s"),
        "ffmpeg_location": imageio_ffmpeg.get_ffmpeg_exe(),
        "progress_hooks": [hook],
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "restrictfilenames": True,
    }

    if media_type == "audio":
        ydl_opts["format"] = "bestaudio/best"
        if audio_format != "source":
            codec, _, quality = audio_format.partition("-")
            postprocessor: dict = {"key": "FFmpegExtractAudio", "preferredcodec": codec}
            if quality:
                postprocessor["preferredquality"] = quality
            ydl_opts["postprocessors"] = [postprocessor]
    else:
        if video_quality == "source":
            ydl_opts["format"] = "bestvideo+bestaudio/best"
        else:
            height = video_quality.rstrip("p")
            ydl_opts["format"] = f"bestvideo[height<={height}]+bestaudio/best[height<={height}]/best"
        ydl_opts["merge_output_format"] = "mp4"

    with _cookies_file() as cookiefile:
        if cookiefile:
            ydl_opts["cookiefile"] = cookiefile

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
        except DownloadError as exc:
            raise _friendly_download_error(exc) from exc

    if info is None:
        raise RuntimeError("yt-dlp returned no result for this URL")

    # Search queries (ytsearch1:...) and playlist-shaped URLs come back as a
    # wrapper with an "entries" list rather than a flat video dict — the
    # wrapper's own "id" doesn't match the actual downloaded file's id.
    entries = info.get("entries")
    if entries is not None:
        entries = list(entries)
        if not entries:
            raise RuntimeError("No results found for that search or URL")
        info = entries[0]

    if progress_callback:
        progress_callback(95, "finalizing")

    result_path = _pick_output_file(out_dir, info["id"])

    if progress_callback:
        progress_callback(100, "complete")

    return DownloadResult(
        file_path=result_path,
        title=info.get("title"),
        artist=info.get("artist") or info.get("uploader") or info.get("channel"),
        thumbnail_url=info.get("thumbnail"),
        duration_seconds=info.get("duration"),
    )
