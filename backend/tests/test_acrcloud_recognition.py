import tempfile
import unittest
from contextlib import nullcontext
from pathlib import Path
from unittest.mock import AsyncMock, patch

from app.core.config import settings
from app.services.recognition import acrcloud_service, service, shazam_service
from app.services.recognition.types import (
    RecognitionMatch,
    RecognitionMode,
    RecognitionProviderError,
    RecognitionProviderUnavailable,
)


def humming_payload(*candidates: dict) -> dict:
    return {
        "status": {"code": 0, "msg": "Success"},
        "metadata": {"humming": list(candidates)},
    }


class ACRCloudParsingTests(unittest.TestCase):
    def test_signature_matches_acrcloud_protocol(self) -> None:
        self.assertEqual(
            "iBfU+Pr4tncyMr9T7iihwUaPJGA=",
            acrcloud_service._signature("test-key", "test-secret", "1700000000"),
        )

    def test_extracts_highest_scored_valid_humming_candidate(self) -> None:
        match = acrcloud_service._extract_match(
            humming_payload(
                {
                    "title": "Lower result",
                    "artists": [{"name": "First artist"}],
                    "score": "0.31",
                },
                {
                    "title": "As Long As You Love Me",
                    "artists": [{"name": "Backstreet Boys"}],
                    "album": {"name": "Backstreet's Back"},
                    "genres": [{"name": "Pop"}],
                    "acrid": "acr-123",
                    "score": "0.82",
                },
            )
        )

        self.assertIsNotNone(match)
        assert match is not None
        self.assertEqual("As Long As You Love Me", match.title)
        self.assertEqual("Backstreet Boys", match.artist)
        self.assertEqual("Backstreet's Back", match.album)
        self.assertEqual("Pop", match.genre)
        self.assertEqual("acr-123", match.provider_key)
        self.assertEqual("acrcloud", match.provider)
        self.assertEqual(RecognitionMode.HUMMING, match.match_kind)
        self.assertEqual(0.82, match.confidence_score)

    def test_no_result_code_is_a_real_no_match(self) -> None:
        self.assertIsNone(acrcloud_service._extract_match({"status": {"code": 1001}}))

    def test_extracts_largest_spotify_cover_from_external_metadata(self) -> None:
        match = acrcloud_service._extract_match(
            humming_payload(
                {
                    "title": "Covered song",
                    "artists": [{"name": "Covered artist"}],
                    "score": "0.9",
                    "external_metadata": {
                        "spotify": {
                            "album": {
                                "images": [
                                    {"url": "https://img.example/small.jpg", "width": 64, "height": 64},
                                    {"url": "https://img.example/large.jpg", "width": 640, "height": 640},
                                ]
                            }
                        }
                    },
                }
            )
        )

        self.assertIsNotNone(match)
        assert match is not None
        self.assertEqual("https://img.example/large.jpg", match.thumbnail_url)

    def test_provider_errors_are_not_collapsed_into_no_match(self) -> None:
        with self.assertRaisesRegex(RecognitionProviderError, "credentials are invalid"):
            acrcloud_service._extract_match({"status": {"code": 3001}})

    def test_only_https_host_without_path_is_accepted(self) -> None:
        self.assertEqual(
            "https://identify-eu-west-1.acrcloud.com/v1/identify",
            acrcloud_service._identify_url("identify-eu-west-1.acrcloud.com"),
        )
        with self.assertRaises(RecognitionProviderError):
            acrcloud_service._identify_url("http://identify.example.com")
        with self.assertRaises(RecognitionProviderError):
            acrcloud_service._identify_url("https://identify.example.com/not-the-api")
        with self.assertRaises(RecognitionProviderError):
            acrcloud_service._identify_url("https://identify.example.com:invalid")

    def test_capability_requires_all_three_credentials(self) -> None:
        with (
            patch.object(settings, "acrcloud_host", "identify.example.com"),
            patch.object(settings, "acrcloud_access_key", "key"),
            patch.object(settings, "acrcloud_access_secret", None),
        ):
            self.assertFalse(service.humming_recognition_available())

        with (
            patch.object(settings, "acrcloud_host", "identify.example.com"),
            patch.object(settings, "acrcloud_access_key", "key"),
            patch.object(settings, "acrcloud_access_secret", "secret"),
        ):
            self.assertTrue(service.humming_recognition_available())


class ACRCloudAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_unconfigured_adapter_fails_before_audio_processing(self) -> None:
        with (
            patch.object(settings, "acrcloud_host", None),
            patch.object(settings, "acrcloud_access_key", None),
            patch.object(settings, "acrcloud_access_secret", None),
            patch.object(acrcloud_service, "_normalized_sample") as normalize,
        ):
            with self.assertRaisesRegex(RecognitionProviderUnavailable, "not configured"):
                await acrcloud_service.recognize_file(Path("missing.m4a"))
        normalize.assert_not_called()

    async def test_mocked_provider_response_flows_through_adapter(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            sample = Path(temp_dir) / "humming.mp3"
            sample.write_bytes(b"normalized melody")
            payload = humming_payload(
                {"title": "Hurt", "artists": [{"name": "Christina Aguilera"}], "score": "0.72"}
            )
            with (
                patch.object(settings, "acrcloud_host", "identify.example.com"),
                patch.object(settings, "acrcloud_access_key", "key"),
                patch.object(settings, "acrcloud_access_secret", "secret"),
                patch.object(acrcloud_service, "_normalized_sample", return_value=nullcontext(sample)),
                patch.object(acrcloud_service, "_identify", return_value=payload) as identify,
            ):
                match = await acrcloud_service.recognize_file(Path("recording.m4a"))

        self.assertIsNotNone(match)
        assert match is not None
        self.assertEqual("Hurt", match.title)
        identify.assert_called_once_with(sample, "identify.example.com", "key", "secret")

    async def test_humming_routes_only_to_acrcloud(self) -> None:
        expected = RecognitionMatch(
            title="Song",
            artist="Artist",
            album=None,
            thumbnail_url=None,
            provider_key=None,
            genre=None,
            release_year=None,
            provider="acrcloud",
            match_kind=RecognitionMode.HUMMING,
        )
        with (
            patch.object(settings, "acrcloud_host", "identify.example.com"),
            patch.object(settings, "acrcloud_access_key", "key"),
            patch.object(settings, "acrcloud_access_secret", "secret"),
            patch.object(acrcloud_service, "recognize_file", AsyncMock(return_value=expected)) as acrcloud,
            patch.object(shazam_service, "recognize_file", AsyncMock()) as shazam,
        ):
            result = await service.recognize_file(Path("recording.m4a"), RecognitionMode.HUMMING)

        self.assertEqual(expected, result)
        acrcloud.assert_awaited_once()
        shazam.assert_not_awaited()

    async def test_recording_mode_stays_on_shazam(self) -> None:
        with (
            patch.object(acrcloud_service, "recognize_file", AsyncMock()) as acrcloud,
            patch.object(shazam_service, "recognize_file", AsyncMock(return_value=None)) as shazam,
        ):
            await service.recognize_file(Path("recording.m4a"), RecognitionMode.RECORDING)

        shazam.assert_awaited_once()
        acrcloud.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
