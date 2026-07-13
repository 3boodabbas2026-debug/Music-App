from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from yt_dlp.utils import DownloadError

from app.core.config import settings
from app.services.downloader import ytdlp_service


VALID_COOKIES = (
    "# Netscape HTTP Cookie File\n"
    ".youtube.com\tTRUE\t/\tTRUE\t0\tLOGIN_INFO\tlogin\n"
    ".youtube.com\tTRUE\t/\tTRUE\t0\tSAPISID\ttest\n"
)


class YoutubeDlServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._settings = {
            name: getattr(settings, name)
            for name in (
                "ytdlp_cookies_text",
                "ytdlp_cookies_b64",
                "ytdlp_cookies_file",
                "ytdlp_impersonate",
                "ytdlp_prefer_system_certs",
            )
        }
        settings.ytdlp_cookies_text = None
        settings.ytdlp_cookies_b64 = None
        settings.ytdlp_cookies_file = None
        settings.ytdlp_impersonate = "chrome"
        settings.ytdlp_prefer_system_certs = True

    def tearDown(self) -> None:
        for name, value in self._settings.items():
            setattr(settings, name, value)

    def test_uses_conventional_local_cookie_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cookie_path = Path(tmp) / "youtube_cookies.txt"
            cookie_path.write_text(VALID_COOKIES, encoding="utf-8")
            with (
                patch.object(ytdlp_service, "RENDER_YOUTUBE_COOKIES_FILE", Path(tmp) / "missing-render.txt"),
                patch.object(ytdlp_service, "DEFAULT_YOUTUBE_COOKIES_FILE", cookie_path),
            ):
                with ytdlp_service._cookies_file() as resolved:
                    temp_path = Path(resolved)
                    self.assertNotEqual(resolved, str(cookie_path))
                    self.assertEqual(temp_path.read_text(encoding="utf-8"), VALID_COOKIES)
                self.assertTrue(ytdlp_service._has_cookie_settings())
                self.assertFalse(temp_path.exists())

    def test_uses_render_secret_cookie_file_before_local_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            render_cookie_path = Path(tmp) / "render-youtube-cookies.txt"
            local_cookie_path = Path(tmp) / "local-youtube-cookies.txt"
            render_cookie_path.write_text(VALID_COOKIES, encoding="utf-8")
            local_cookie_path.write_text(VALID_COOKIES.replace("test", "stale"), encoding="utf-8")

            with (
                patch.object(ytdlp_service, "RENDER_YOUTUBE_COOKIES_FILE", render_cookie_path),
                patch.object(ytdlp_service, "DEFAULT_YOUTUBE_COOKIES_FILE", local_cookie_path),
            ):
                with ytdlp_service._cookies_file() as resolved:
                    temp_path = Path(resolved)
                    self.assertNotEqual(resolved, str(render_cookie_path))
                    temp_path.write_text(VALID_COOKIES.replace("test", "yt-dlp-update"), encoding="utf-8")
                self.assertTrue(ytdlp_service._has_cookie_settings())
                self.assertEqual(render_cookie_path.read_text(encoding="utf-8"), VALID_COOKIES)
                self.assertFalse(temp_path.exists())

    def test_environment_cookie_text_is_readable_and_deleted_after_use(self) -> None:
        settings.ytdlp_cookies_text = VALID_COOKIES
        settings.ytdlp_cookies_file = "missing-cookie-file.txt"

        with ytdlp_service._cookies_file() as resolved:
            self.assertIsNotNone(resolved)
            temp_path = Path(resolved)
            self.assertTrue(temp_path.is_file())
            self.assertNotEqual(resolved, settings.ytdlp_cookies_file)
            self.assertEqual(temp_path.read_text(encoding="utf-8"), VALID_COOKIES)
        self.assertFalse(temp_path.exists())

    def test_rejects_invalid_cookie_file_before_downloading(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cookie_path = Path(tmp) / "youtube_cookies.txt"
            cookie_path.write_text("not a Netscape cookie export", encoding="utf-8")
            settings.ytdlp_cookies_file = str(cookie_path)

            with self.assertRaisesRegex(RuntimeError, "Netscape cookies.txt export"):
                with ytdlp_service._cookies_file():
                    self.fail("invalid cookies should not be yielded")

    def test_certificate_failure_retries_without_impersonation(self) -> None:
        calls: list[dict] = []
        test_case = self

        class FakeYoutubeDL:
            def __init__(self, opts: dict) -> None:
                calls.append(opts)

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def extract_info(self, _url: str, download: bool):
                test_case.assertTrue(download)
                if len(calls) == 1:
                    raise DownloadError("curl: (60) SSL certificate problem: unable to get local issuer certificate")
                return {"id": "video-id", "title": "Test", "duration": 1}

        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "video-id.webm"
            output.write_bytes(b"media")
            with (
                patch.object(ytdlp_service.yt_dlp, "YoutubeDL", FakeYoutubeDL),
                patch.object(ytdlp_service, "DEFAULT_YOUTUBE_COOKIES_FILE", Path(tmp) / "absent.txt"),
            ):
                result = ytdlp_service.download_media(
                    "https://www.youtube.com/watch?v=video-id",
                    "audio",
                    Path(tmp),
                    audio_format="source",
                )

        self.assertEqual(result.file_path.name, "video-id.webm")
        self.assertEqual(len(calls), 2)
        self.assertIn("impersonate", calls[0])
        self.assertNotIn("impersonate", calls[1])
        self.assertIn("no-certifi", calls[0]["compat_opts"])
        self.assertIn("no-certifi", calls[1]["compat_opts"])
        self.assertNotIn("nocheckcertificate", calls[0])
        self.assertNotIn("nocheckcertificate", calls[1])

    def test_certificate_error_remains_actionable_after_fallback(self) -> None:
        error = DownloadError("[SSL: CERTIFICATE_VERIFY_FAILED] unable to get local issuer certificate")
        friendly = ytdlp_service._friendly_download_error(error)
        self.assertIn("trusted CA certificates", str(friendly))
        self.assertNotIn("disable", str(friendly).lower())

    def test_cookie_auth_failure_retries_once_without_cookiefile(self) -> None:
        calls: list[dict] = []

        def fake_extract(_url: str, opts: dict) -> dict:
            calls.append(dict(opts))
            if len(calls) == 1:
                raise DownloadError("ERROR: [youtube] Sign in to confirm you're not a bot")
            output.write_bytes(b"media")
            return {"id": "video-id", "title": "Public video", "duration": 1}

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            cookie_path = tmp_path / "youtube_cookies.txt"
            cookie_path.write_text(VALID_COOKIES, encoding="utf-8")
            settings.ytdlp_cookies_file = str(cookie_path)
            output = tmp_path / "video-id.webm"

            with patch.object(ytdlp_service, "_extract_with_transport_fallback", fake_extract):
                result = ytdlp_service.download_media(
                    "https://www.youtube.com/watch?v=video-id",
                    "audio",
                    tmp_path,
                    audio_format="source",
                )

        self.assertEqual(result.file_path.name, "video-id.webm")
        self.assertEqual(len(calls), 2)
        self.assertIn("cookiefile", calls[0])
        self.assertNotIn("cookiefile", calls[1])

    def test_non_auth_download_error_does_not_retry_without_cookies(self) -> None:
        calls: list[dict] = []

        def fake_extract(_url: str, opts: dict) -> dict:
            calls.append(dict(opts))
            raise DownloadError("ERROR: [youtube] This video is unavailable")

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            cookie_path = tmp_path / "youtube_cookies.txt"
            cookie_path.write_text(VALID_COOKIES, encoding="utf-8")
            settings.ytdlp_cookies_file = str(cookie_path)

            with (
                patch.object(ytdlp_service, "_extract_with_transport_fallback", fake_extract),
                self.assertRaisesRegex(RuntimeError, "This video is unavailable"),
            ):
                ytdlp_service.download_media(
                    "https://www.youtube.com/watch?v=video-id",
                    "audio",
                    tmp_path,
                    audio_format="source",
                )

        self.assertEqual(len(calls), 1)

    def test_anonymous_retry_failure_preserves_friendly_error(self) -> None:
        calls: list[dict] = []

        def fake_extract(_url: str, opts: dict) -> dict:
            calls.append(dict(opts))
            raise DownloadError("ERROR: [youtube] Sign in to confirm you're not a bot")

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            cookie_path = tmp_path / "private-youtube-cookies.txt"
            cookie_path.write_text(VALID_COOKIES, encoding="utf-8")
            settings.ytdlp_cookies_file = str(cookie_path)

            with (
                patch.object(ytdlp_service, "_extract_with_transport_fallback", fake_extract),
                self.assertRaises(RuntimeError) as raised,
            ):
                ytdlp_service.download_media(
                    "https://youtu.be/video-id",
                    "audio",
                    tmp_path,
                    audio_format="source",
                )

        self.assertEqual(len(calls), 2)
        self.assertIn("configured cookies", str(raised.exception))
        self.assertNotIn(str(cookie_path), str(raised.exception))
        self.assertNotIn("login", str(raised.exception).lower())

    def test_valid_cookie_success_does_not_retry(self) -> None:
        calls: list[dict] = []

        def fake_extract(_url: str, opts: dict) -> dict:
            calls.append(dict(opts))
            output.write_bytes(b"media")
            return {"id": "video-id", "title": "Restricted video", "duration": 1}

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            cookie_path = tmp_path / "youtube_cookies.txt"
            cookie_path.write_text(VALID_COOKIES, encoding="utf-8")
            settings.ytdlp_cookies_file = str(cookie_path)
            output = tmp_path / "video-id.webm"

            with patch.object(ytdlp_service, "_extract_with_transport_fallback", fake_extract):
                result = ytdlp_service.download_media(
                    "https://www.youtube.com/watch?v=video-id",
                    "audio",
                    tmp_path,
                    audio_format="source",
                )

        self.assertEqual(result.file_path.name, "video-id.webm")
        self.assertEqual(len(calls), 1)
        self.assertIn("cookiefile", calls[0])


if __name__ == "__main__":
    unittest.main()
