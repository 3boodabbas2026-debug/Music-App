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

import subprocess
from pathlib import Path

import imageio_ffmpeg

THUMB_SUFFIX = ".thumb.jpg"


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
