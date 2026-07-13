from __future__ import annotations

import enum
from dataclasses import dataclass


class RecognitionMode(str, enum.Enum):
    RECORDING = "recording"
    HUMMING = "humming"


@dataclass(frozen=True)
class RecognitionMatch:
    title: str
    artist: str
    album: str | None
    thumbnail_url: str | None
    provider_key: str | None
    genre: str | None
    release_year: int | None
    provider: str
    match_kind: RecognitionMode
    confidence_score: float | None = None


class RecognitionProviderError(RuntimeError):
    """A configured recognition provider failed to process a request."""


class RecognitionProviderUnavailable(RecognitionProviderError):
    """A requested recognition capability has no configured provider."""
