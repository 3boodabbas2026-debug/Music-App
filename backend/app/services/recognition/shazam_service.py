"""Song recognition via shazamio.

Ported from the working recognize_music_by_audio.py fingerprinting flow in the
original vault_app project: try the file as-is, and if Shazam's client can't
parse the container, fall back to a normalized 35s MP3 sample via ffmpeg.
"""
from __future__ import annotations

import re
import subprocess
import tempfile
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

warnings.filterwarnings(
    "ignore", message="Couldn't find ffmpeg or avconv.*", category=RuntimeWarning
)

import imageio_ffmpeg
from shazamio import Shazam


@dataclass
class RecognitionMatch:
    title: str
    artist: str
    album: Optional[str]
    thumbnail_url: Optional[str]
    shazam_key: Optional[str]
    genre: Optional[str]
    release_year: Optional[int]


def _clean_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def _convert_sample(source: Path) -> Path:
    tmp_dir = Path(tempfile.mkdtemp(prefix="sma_recognize_"))
    target = tmp_dir / "sample.mp3"
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    command = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(source), "-t", "35", "-vn", "-ar", "44100", "-ac", "2", "-b:a", "128k",
        str(target),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0 or not target.exists() or target.stat().st_size == 0:
        raise RuntimeError(result.stderr.strip() or "ffmpeg sample conversion failed")
    return target


def _extract_match(raw: dict[str, Any]) -> Optional[RecognitionMatch]:
    track = raw.get("track")
    if not track:
        return None

    title = _clean_text(track.get("title"))
    artist = _clean_text(track.get("subtitle"))
    if not title or not artist:
        return None

    images = track.get("images") or {}
    genres = track.get("genres") or {}
    sections = track.get("sections") or []
    album = None
    release_year = None
    for section in sections:
        if section.get("type") == "SONG":
            for meta in section.get("metadata", []):
                title_field = meta.get("title")
                if title_field == "Album":
                    album = _clean_text(meta.get("text"))
                elif title_field == "Released":
                    year_match = re.search(r"\d{4}", str(meta.get("text") or ""))
                    if year_match:
                        release_year = int(year_match.group())

    return RecognitionMatch(
        title=title,
        artist=artist,
        album=album,
        thumbnail_url=images.get("coverarthq") or images.get("coverart") or images.get("background"),
        shazam_key=str(track.get("key")) if track.get("key") else None,
        genre=genres.get("primary"),
        release_year=release_year,
    )


async def recognize_file(path: Path) -> Optional[RecognitionMatch]:
    shazam = Shazam()
    try:
        raw = await shazam.recognize(str(path))
    except Exception:
        raw = None

    match = _extract_match(raw) if raw else None
    if match is not None:
        return match

    # Container Shazam's client didn't like — retry with a normalized sample.
    try:
        sample_path = _convert_sample(path)
    except RuntimeError:
        return None

    try:
        raw = await shazam.recognize(str(sample_path))
    except Exception:
        return None
    finally:
        sample_path.unlink(missing_ok=True)
        sample_path.parent.rmdir()

    return _extract_match(raw) if raw else None
