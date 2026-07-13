from __future__ import annotations

from pathlib import Path

from app.core.config import settings
from app.services.recognition import acrcloud_service, shazam_service
from app.services.recognition.types import RecognitionMatch, RecognitionMode, RecognitionProviderUnavailable


def humming_recognition_available() -> bool:
    return settings.acrcloud_humming_configured


async def recognize_file(path: Path, mode: RecognitionMode = RecognitionMode.RECORDING) -> RecognitionMatch | None:
    if mode == RecognitionMode.HUMMING:
        if not humming_recognition_available():
            raise RecognitionProviderUnavailable(
                "Humming recognition is unavailable because ACRCloud is not configured."
            )
        # A hummed melody must never be sent to Shazam: its exact-recording
        # fingerprints cannot represent a person's voice or whistle.
        return await acrcloud_service.recognize_file(path)

    return await shazam_service.recognize_file(path)
