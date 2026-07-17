"""Poster-frame generation for video media via ffmpeg.

Telegram-imported videos arrive with no thumbnail at all, and some source
sites hand back a useless placeholder graphic — so the library and the video
player end up showing a wall of empty gray tiles. ffmpeg is already a hard
dependency (the recognition sampler uses it), so extract one real frame per
video and serve that instead.

Local-storage mode only: the thumbnail lives next to the media file as
`<file_path>.thumb.jpg`, so no schema change and no key bookkeeping is
needed — the serving endpoint re-derives the path from the media row. In S3
mode generation is skipped (the media bytes aren't on local disk to sample).
"""
from __future__ import annotations

import ipaddress
import socket
import subprocess
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

import imageio_ffmpeg

THUMB_SUFFIX = ".thumb.jpg"
MAX_ARTWORK_BYTES = 8 * 1024 * 1024
_ARTWORK_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
}


def thumbnail_path_for(media_file_path: str) -> Path:
    return Path(f"{media_file_path}{THUMB_SUFFIX}")


def generate_video_thumbnail(media_file_path: str) -> Path | None:
    """Extract a single frame ~1s in, scaled to 480px wide. Returns the
    thumbnail path, or None if the source is missing or ffmpeg fails —
    callers treat None as "keep whatever thumbnail_url is already there"."""
    source = Path(media_file_path)
    if not source.exists():
        return None

    out_path = thumbnail_path_for(media_file_path)
    if out_path.exists():
        return out_path

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    result = subprocess.run(
        [
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
            "-ss", "1", "-i", str(source),
            "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4",
            str(out_path),
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0 or not out_path.exists() or out_path.stat().st_size == 0:
        # Very short clips can have nothing at the 1s mark — retry from the start.
        result = subprocess.run(
            [
                ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                "-i", str(source),
                "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4",
                str(out_path),
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
    if result.returncode != 0 or not out_path.exists() or out_path.stat().st_size == 0:
        out_path.unlink(missing_ok=True)
        return None
    return out_path


def _validate_public_artwork_url(url: str) -> None:
    """Reject local/private destinations before fetching provider artwork."""
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Artwork URL is invalid")
    try:
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except OSError as exc:
        raise ValueError("Artwork host could not be resolved") from exc
    if not addresses:
        raise ValueError("Artwork host could not be resolved")
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0].split("%", 1)[0])
        if not ip.is_global:
            raise ValueError("Artwork URL must use a public host")


class _PublicArtworkRedirectHandler(HTTPRedirectHandler):
    """Validate every redirect destination before urllib opens it."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urljoin(req.full_url, newurl)
        _validate_public_artwork_url(target)
        return super().redirect_request(req, fp, code, msg, headers, target)


def _artwork_type(content_type: str | None, body: bytes) -> tuple[str, str] | None:
    normalized = (content_type or "").split(";", 1)[0].strip().lower()
    if normalized in _ARTWORK_TYPES:
        return normalized, _ARTWORK_TYPES[normalized]
    if body.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"
    if body.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"
    if body.startswith(b"RIFF") and body[8:12] == b"WEBP":
        return "image/webp", ".webp"
    if len(body) >= 12 and body[4:12] in {b"ftypavif", b"ftypavis"}:
        return "image/avif", ".avif"
    return None


def download_remote_artwork(url: str, destination_dir: Path) -> tuple[Path, str] | None:
    """Download a bounded real cover once; callers adopt it into storage."""
    _validate_public_artwork_url(url)
    request = Request(url, headers={"User-Agent": "Starhollow/1.0", "Accept": "image/*"})
    opener = build_opener(_PublicArtworkRedirectHandler())
    with opener.open(request, timeout=15) as response:
        _validate_public_artwork_url(response.geturl())
        body = response.read(MAX_ARTWORK_BYTES + 1)
        if len(body) > MAX_ARTWORK_BYTES:
            raise ValueError("Artwork is too large")
        detected = _artwork_type(response.headers.get("Content-Type"), body)
    if not body or detected is None:
        return None

    mime_type, suffix = detected
    destination_dir.mkdir(parents=True, exist_ok=True)
    output = destination_dir / f"artwork{suffix}"
    output.write_bytes(body)
    return output, mime_type
