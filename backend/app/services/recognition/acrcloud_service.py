"""Humming/singing recognition through ACRCloud's melody engine.

The ACRCloud project must be configured with the ``ACRCloud Music`` bucket
and the Cover Song (humming) Identification engine. Credentials stay on the
backend; callers only choose the recognition mode.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import mimetypes
import subprocess
import tempfile
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

import imageio_ffmpeg

from app.core.config import settings
from app.services.recognition.types import (
    RecognitionMatch,
    RecognitionMode,
    RecognitionProviderError,
    RecognitionProviderUnavailable,
)

IDENTIFY_PATH = "/v1/identify"
MAX_PROVIDER_SAMPLE_BYTES = 5 * 1024 * 1024
SAMPLE_SECONDS = 14

_ERROR_MESSAGES = {
    3000: "The humming recognition service could not be reached.",
    3001: "The humming recognition service credentials are invalid.",
    3002: "The humming recognition service rejected the request.",
    3003: "The humming recognition quota has been exhausted.",
    3006: "The humming recognition service rejected the audio sample.",
    3010: "The humming recognition service is temporarily unavailable.",
    3014: "The humming recognition request signature was rejected.",
    3015: "The humming recognition rate limit has been reached.",
}


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split()).strip()
    return text or None


def _configured_credentials() -> tuple[str, str, str]:
    host = _clean_text(settings.acrcloud_host)
    access_key = _clean_text(settings.acrcloud_access_key)
    access_secret = _clean_text(settings.acrcloud_access_secret)
    if not host or not access_key or not access_secret:
        raise RecognitionProviderUnavailable(
            "Humming recognition is unavailable because ACRCloud is not configured."
        )
    return host, access_key, access_secret


def _identify_url(host: str) -> str:
    candidate = host if "://" in host else f"https://{host}"
    parsed = urlsplit(candidate)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise RecognitionProviderError("The humming recognition service host is invalid.")
    if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise RecognitionProviderError("The humming recognition service host is invalid.")
    try:
        port_number = parsed.port
    except ValueError as exc:
        raise RecognitionProviderError("The humming recognition service host is invalid.") from exc
    port = f":{port_number}" if port_number else ""
    return f"https://{parsed.hostname}{port}{IDENTIFY_PATH}"


def _signature(access_key: str, access_secret: str, timestamp: str) -> str:
    string_to_sign = "\n".join(("POST", IDENTIFY_PATH, access_key, "audio", "1", timestamp))
    digest = hmac.new(access_secret.encode("ascii"), string_to_sign.encode("ascii"), hashlib.sha1).digest()
    return base64.b64encode(digest).decode("ascii")


def _multipart_body(fields: dict[str, str], sample_path: Path) -> tuple[bytes, str]:
    boundary = f"starhollow-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend(
            (
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                value.encode(),
                b"\r\n",
            )
        )

    content_type = mimetypes.guess_type(sample_path.name)[0] or "application/octet-stream"
    chunks.extend(
        (
            f"--{boundary}\r\n".encode(),
            (
                f'Content-Disposition: form-data; name="sample"; filename="{sample_path.name}"\r\n'
                f"Content-Type: {content_type}\r\n\r\n"
            ).encode(),
            sample_path.read_bytes(),
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        )
    )
    return b"".join(chunks), boundary


@contextmanager
def _normalized_sample(source: Path) -> Iterator[Path]:
    """Yield a short provider-safe MP3 and always remove its temp directory."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="sma_humming_"))
    target = tmp_dir / "humming.mp3"
    try:
        command = [
            imageio_ffmpeg.get_ffmpeg_exe(),
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(source),
            "-t",
            str(SAMPLE_SECONDS),
            "-vn",
            "-ar",
            "44100",
            "-ac",
            "1",
            "-b:a",
            "96k",
            str(target),
        ]
        try:
            result = subprocess.run(command, capture_output=True, text=True)
        except OSError as exc:
            raise RecognitionProviderError("The recorded melody could not be prepared for recognition.") from exc
        if result.returncode != 0 or not target.exists() or target.stat().st_size == 0:
            raise RecognitionProviderError("The recorded melody could not be prepared for recognition.")
        if target.stat().st_size > MAX_PROVIDER_SAMPLE_BYTES:
            raise RecognitionProviderError("The recorded melody is too large for the recognition service.")
        yield target
    finally:
        target.unlink(missing_ok=True)
        tmp_dir.rmdir()


def _identify(sample_path: Path, host: str, access_key: str, access_secret: str) -> dict[str, Any]:
    timestamp = str(int(time.time()))
    fields = {
        "access_key": access_key,
        "sample_bytes": str(sample_path.stat().st_size),
        "timestamp": timestamp,
        "signature": _signature(access_key, access_secret, timestamp),
        "data_type": "audio",
        "signature_version": "1",
    }
    body, boundary = _multipart_body(fields, sample_path)
    request = Request(
        _identify_url(host),
        data=body,
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    try:
        with urlopen(request, timeout=settings.recognition_timeout_seconds) as response:
            payload = response.read()
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RecognitionProviderError("The humming recognition service could not be reached.") from exc

    try:
        decoded = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RecognitionProviderError("The humming recognition service returned an invalid response.") from exc
    if not isinstance(decoded, dict):
        raise RecognitionProviderError("The humming recognition service returned an invalid response.")
    return decoded


def _score(candidate: dict[str, Any]) -> float:
    try:
        return float(candidate.get("score"))
    except (TypeError, ValueError):
        return -1.0


def _extract_match(raw: dict[str, Any]) -> RecognitionMatch | None:
    status = raw.get("status") if isinstance(raw.get("status"), dict) else {}
    try:
        code = int(status.get("code"))
    except (TypeError, ValueError):
        raise RecognitionProviderError("The humming recognition service returned an invalid response.")

    if code == 1001:
        return None
    if code != 0:
        raise RecognitionProviderError(_ERROR_MESSAGES.get(code, "The humming recognition service failed."))

    metadata = raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {}
    candidates = metadata.get("humming")
    if not isinstance(candidates, list):
        return None

    valid: list[tuple[dict[str, Any], str, str]] = []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        title = _clean_text(candidate.get("title"))
        artists = candidate.get("artists")
        artist = None
        if isinstance(artists, list):
            for item in artists:
                if isinstance(item, dict) and (artist := _clean_text(item.get("name"))):
                    break
        if title and artist:
            valid.append((candidate, title, artist))
    if not valid:
        return None

    candidate, title, artist = max(valid, key=lambda item: _score(item[0]))
    album_data = candidate.get("album") if isinstance(candidate.get("album"), dict) else {}
    genres = candidate.get("genres") if isinstance(candidate.get("genres"), list) else []
    genre = next(
        (_clean_text(item.get("name")) for item in genres if isinstance(item, dict) and _clean_text(item.get("name"))),
        None,
    )
    score = _score(candidate)
    return RecognitionMatch(
        title=title,
        artist=artist,
        album=_clean_text(album_data.get("name")),
        thumbnail_url=None,
        provider_key=_clean_text(candidate.get("acrid")),
        genre=genre,
        release_year=None,
        provider="acrcloud",
        match_kind=RecognitionMode.HUMMING,
        confidence_score=score if score >= 0 else None,
    )


async def recognize_file(path: Path) -> RecognitionMatch | None:
    host, access_key, access_secret = _configured_credentials()
    with _normalized_sample(path) as sample_path:
        raw = await asyncio.to_thread(_identify, sample_path, host, access_key, access_secret)
    return _extract_match(raw)
