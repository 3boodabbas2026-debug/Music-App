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
from urllib.parse import urlsplit

import imageio_ffmpeg
import yt_dlp
from yt_dlp.networking.impersonate import ImpersonateTarget
from yt_dlp.utils import DownloadError

from app.core.config import BACKEND_ROOT, settings

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
DEFAULT_YOUTUBE_COOKIES_FILE = BACKEND_ROOT / "cookies" / "youtube_cookies.txt"
RENDER_YOUTUBE_COOKIES_FILE = Path("/etc/secrets/youtube_cookies.txt")
_CERTIFICATE_ERROR_MARKERS = (
    "certificate verify failed",
    "ssl certificate problem",
    "unable to get local issuer certificate",
)
_YOUTUBE_AUTH_ERROR_MARKERS = (
    "sign in to confirm",
    "not a bot",
    "youtube account cookies are no longer valid",
)


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _split_csv(value: str | None) -> list[str]:
    value = _clean(value)
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def _validate_cookie_bytes(cookie_bytes: bytes) -> None:
    first_line = cookie_bytes.splitlines()[0].decode("utf-8", errors="replace").strip() if cookie_bytes else ""
    valid_headers = {"# Netscape HTTP Cookie File", "# HTTP Cookie File"}
    if first_line not in valid_headers:
        raise RuntimeError(
            "YouTube cookies must be a Netscape cookies.txt export. The first line should be "
            "'# Netscape HTTP Cookie File'."
        )


def _cookie_bytes_from_env() -> bytes | None:
    cookie_text = settings.ytdlp_cookies_text
    if cookie_text:
        if "\\n" in cookie_text and "\n" not in cookie_text:
            cookie_text = cookie_text.replace("\\r\\n", "\n").replace("\\n", "\n")
        cookie_bytes = cookie_text.replace("\r\n", "\n").encode("utf-8")
        _validate_cookie_bytes(cookie_bytes)
        return cookie_bytes

    if not settings.ytdlp_cookies_b64:
        return None

    try:
        cookie_bytes = base64.b64decode(settings.ytdlp_cookies_b64.strip(), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise RuntimeError("SMA_YTDLP_COOKIES_B64 is not valid base64") from exc
    _validate_cookie_bytes(cookie_bytes)
    return cookie_bytes


@contextmanager
def _temporary_cookie_file(cookie_bytes: bytes) -> Iterator[str]:
    # yt-dlp writes its cookie jar back when YoutubeDL closes. Always give it
    # a writable disposable copy so read-only secret mounts and source exports
    # are never modified.
    handle = tempfile.NamedTemporaryFile("wb", suffix=".cookies.txt", delete=False)
    temp_path = Path(handle.name)
    try:
        handle.write(cookie_bytes)
        handle.close()
        yield str(temp_path)
    finally:
        if not handle.closed:
            handle.close()
        temp_path.unlink(missing_ok=True)


@contextmanager
def _cookies_file() -> Iterator[str | None]:
    # Text/base64 is the deployment-safe source and deliberately wins over
    # disk paths. This keeps a stale local file from shadowing freshly rotated
    # hosted credentials.
    cookie_bytes = _cookie_bytes_from_env()
    if cookie_bytes is not None:
        with _temporary_cookie_file(cookie_bytes) as temp_path:
            yield temp_path
        return

    cookies_file = _clean(settings.ytdlp_cookies_file)
    if cookies_file:
        cookie_paths = (Path(cookies_file).expanduser(),)
    else:
        # Render secret files do not consume the process environment, so they
        # remain safe even when a browser export is too large for ARG_MAX.
        cookie_paths = (RENDER_YOUTUBE_COOKIES_FILE, DEFAULT_YOUTUBE_COOKIES_FILE)

    for cookie_path in cookie_paths:
        if not cookie_path.is_file():
            continue
        try:
            cookie_bytes = cookie_path.read_bytes()
            _validate_cookie_bytes(cookie_bytes)
        except OSError as exc:
            raise RuntimeError(f"Could not read YouTube cookies file: {cookie_path}") from exc
        with _temporary_cookie_file(cookie_bytes) as temp_path:
            yield temp_path
        return
    if cookies_file:
        raise RuntimeError(f"SMA_YTDLP_COOKIES_FILE does not exist: {cookie_paths[0]}")
    yield None


def _has_cookie_settings() -> bool:
    return any(path.is_file() for path in (RENDER_YOUTUBE_COOKIES_FILE, DEFAULT_YOUTUBE_COOKIES_FILE)) or any(
        _clean(value)
        for value in (
            settings.ytdlp_cookies_text,
            settings.ytdlp_cookies_b64,
            settings.ytdlp_cookies_file,
        )
    )


def _is_certificate_error(error: object) -> bool:
    message = str(error).lower()
    return any(marker in message for marker in _CERTIFICATE_ERROR_MARKERS)


def _is_youtube_source(url: str) -> bool:
    if url.lower().startswith("ytsearch"):
        return True
    try:
        hostname = (urlsplit(url).hostname or "").lower().rstrip(".")
    except ValueError:
        return False
    return hostname == "youtu.be" or hostname == "youtube.com" or hostname.endswith(".youtube.com")


def _is_youtube_auth_error(error: object) -> bool:
    message = str(error).lower()
    return any(marker in message for marker in _YOUTUBE_AUTH_ERROR_MARKERS)


def _extract_info(url: str, ydl_opts: dict) -> dict | None:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        return ydl.extract_info(url, download=True)


def _extract_with_transport_fallback(url: str, ydl_opts: dict) -> dict | None:
    """Retry a failed impersonated request through the OS trust store.

    curl-cffi supplies browser impersonation but uses a separate CA bundle.
    On managed machines that bundle can reject a certificate already trusted
    by the operating system. For that certificate failure only, retry through
    yt-dlp's native transport. Certificate verification remains enabled.
    """
    try:
        return _extract_info(url, ydl_opts)
    except DownloadError as exc:
        if "impersonate" not in ydl_opts or not _is_certificate_error(exc):
            raise

    fallback_opts = dict(ydl_opts)
    fallback_opts.pop("impersonate", None)
    fallback_opts["compat_opts"] = set(fallback_opts.get("compat_opts", ())) | {"no-certifi"}
    return _extract_info(url, fallback_opts)


def _youtube_extractor_args() -> dict[str, dict[str, list[str]]]:
    youtube_args: dict[str, list[str]] = {}
    player_clients = _split_csv(settings.ytdlp_youtube_player_clients)
    if player_clients:
        youtube_args["player_client"] = player_clients

    visitor_data = _clean(settings.ytdlp_youtube_visitor_data)
    if visitor_data:
        youtube_args["visitor_data"] = [visitor_data]
        youtube_args.setdefault("player_skip", ["webpage", "configs"])

    po_tokens = _split_csv(settings.ytdlp_youtube_po_token)
    if po_tokens:
        youtube_args["po_token"] = po_tokens

    return {"youtube": youtube_args} if youtube_args else {}


def _friendly_download_error(exc: DownloadError) -> RuntimeError:
    message = str(exc)
    if _is_certificate_error(exc):
        return RuntimeError(
            "The backend could not verify the media site's secure connection. Update the host's trusted "
            "CA certificates, or enable SMA_YTDLP_PREFER_SYSTEM_CERTS so yt-dlp uses the operating system store."
        )
    needs_cookies = _is_youtube_auth_error(exc)
    has_cookies = _has_cookie_settings()
    if needs_cookies and not has_cookies:
        return RuntimeError(
            "YouTube blocked this server as a bot. The backend now supports cookies, browser impersonation, "
            "Node/EJS challenges, optional proxies, and PO tokens, but this Render IP still needs authenticated "
            "YouTube cookies. Add a Render Secret File named youtube_cookies.txt, set "
            "SMA_YTDLP_COOKIES_FILE=/etc/secrets/youtube_cookies.txt, then redeploy."
        )
    if needs_cookies and has_cookies:
        return RuntimeError(
            "YouTube still rejected the configured cookies. Export a fresh Netscape cookies.txt from a new "
            "private/incognito YouTube session, navigate that tab to https://www.youtube.com/robots.txt before "
            "exporting, replace the Render Secret File youtube_cookies.txt, then redeploy. If it still fails, "
            "Render's IP is blocked for that account/session and you need SMA_YTDLP_PROXY_URL with a clean "
            "residential/ISP proxy."
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
        "js_runtimes": {"node": {}},
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "restrictfilenames": True,
    }
    if settings.ytdlp_prefer_system_certs:
        # `no-certifi` still performs full TLS verification; it changes only
        # the source of trusted roots from certifi to the host OS.
        ydl_opts["compat_opts"] = {"no-certifi"}
    impersonate = _clean(settings.ytdlp_impersonate)
    if impersonate:
        ydl_opts["impersonate"] = ImpersonateTarget.from_str(impersonate)

    proxy_url = _clean(settings.ytdlp_proxy_url)
    if proxy_url:
        ydl_opts["proxy"] = proxy_url

    extractor_args = _youtube_extractor_args()
    if extractor_args:
        ydl_opts["extractor_args"] = extractor_args

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
            info = _extract_with_transport_fallback(url, ydl_opts)
        except DownloadError as exc:
            if not cookiefile or not _is_youtube_source(url) or not _is_youtube_auth_error(exc):
                raise _friendly_download_error(exc) from exc

            # A stale or incomplete cookie jar can make a public video fail
            # even when anonymous extraction still works. Retry once without
            # the cookie jar; keep all transport fallbacks and other options.
            anonymous_opts = dict(ydl_opts)
            anonymous_opts.pop("cookiefile", None)
            try:
                info = _extract_with_transport_fallback(url, anonymous_opts)
            except DownloadError as anonymous_exc:
                raise _friendly_download_error(anonymous_exc) from anonymous_exc

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
