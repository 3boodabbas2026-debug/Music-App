import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.v1.endpoints import downloads
from app.db.base import Base
from app.models.admin_event import AdminEvent  # noqa: F401 - register metadata
from app.models.job import Job, JobStatus, JobType
from app.models.media import Media  # noqa: F401 - resolve User relationships
from app.models.playlist import Playlist, PlaylistItem  # noqa: F401 - resolve User relationships
from app.models.user import User
from app.schemas.job import DownloadCreate, JobOut


class DownloadBatchEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.engine = create_async_engine(
            f"sqlite+aiosqlite:///{Path(self.temp_dir.name) / 'downloads.db'}"
        )

        @event.listens_for(self.engine.sync_engine, "connect")
        def enable_foreign_keys(dbapi_connection, _connection_record) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False, class_=AsyncSession)
        async with self.sessions() as session:
            user = User(email="downloads@example.com", display_name="Downloads", hashed_password="hash")
            session.add(user)
            await session.commit()
            self.user_id = user.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()
        self.temp_dir.cleanup()

    async def test_new_urls_contract_returns_independent_jobs_with_playlist_flag(self) -> None:
        payload = DownloadCreate(
            urls=["https://example.com/one", "https://example.com/two"],
            media_type="audio",
            download_playlist=True,
        )
        tasks = BackgroundTasks()
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            with patch.object(downloads.ytdlp_service, "validate_media_url", side_effect=lambda url: url):
                result = await downloads.create_download(payload, tasks, user, session)
            rows = list((await session.scalars(select(Job).order_by(Job.source_url))).all())

        self.assertIsInstance(result, list)
        self.assertEqual(2, len(result))
        self.assertTrue(all(isinstance(item, JobOut) for item in result))
        self.assertEqual(2, len(tasks.tasks))
        self.assertEqual(2, len(rows))
        self.assertTrue(all(json.loads(row.request_payload)["download_playlist"] for row in rows))
        self.assertEqual(
            ["https://example.com/one", "https://example.com/two"],
            [row.source_url for row in rows],
        )

    async def test_legacy_url_contract_preserves_single_job_response(self) -> None:
        payload = DownloadCreate(url="https://example.com/legacy", media_type="video")
        tasks = BackgroundTasks()
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            with patch.object(downloads.ytdlp_service, "validate_media_url", side_effect=lambda url: url):
                result = await downloads.create_download(payload, tasks, user, session)
            count = await session.scalar(select(func.count()).select_from(Job))

        self.assertIsInstance(result, JobOut)
        self.assertEqual("https://example.com/legacy", result.source_url)
        self.assertEqual(1, count)
        self.assertEqual(1, len(tasks.tasks))

    def test_pasted_whitespace_links_are_normalized_and_deduplicated(self) -> None:
        payload = DownloadCreate(
            url="https://example.com/one\nhttps://example.com/two https://example.com/one"
        )
        self.assertEqual(
            ["https://example.com/one", "https://example.com/two"], payload.urls
        )

        search = DownloadCreate(url="ytsearch5: artist song title")
        self.assertEqual(["ytsearch5: artist song title"], search.urls)

    async def test_invalid_or_private_url_is_rejected_before_job_creation(self) -> None:
        payload = DownloadCreate(urls=["http://internal.example/track"])
        tasks = BackgroundTasks()
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            with patch.object(
                downloads.ytdlp_service,
                "validate_media_url",
                side_effect=ValueError("Media URL must not resolve to a private or local address"),
            ):
                with self.assertRaises(HTTPException) as raised:
                    await downloads.create_download(payload, tasks, user, session)
            count = await session.scalar(select(func.count()).select_from(Job))

        self.assertEqual(422, raised.exception.status_code)
        self.assertEqual(0, count)
        self.assertEqual([], tasks.tasks)

    async def test_inspect_rejects_invalid_url_before_provider_probe(self) -> None:
        with (
            patch.object(
                downloads.ytdlp_service,
                "validate_media_url",
                side_effect=ValueError("Media URL must use http or https"),
            ),
            patch.object(downloads.ytdlp_service, "inspect_url") as inspect,
        ):
            with self.assertRaises(HTTPException) as raised:
                await downloads.inspect_download(
                    downloads.DownloadInspectCreate(url="file:///etc/passwd"), self.user_id
                )
        self.assertEqual(422, raised.exception.status_code)
        inspect.assert_not_called()

    async def test_worker_revalidates_queued_or_retried_url_before_ytdlp(self) -> None:
        async with self.sessions() as session:
            job = Job(
                user_id=self.user_id,
                job_type=JobType.DOWNLOAD,
                source_url="https://rebind.example/track",
            )
            session.add(job)
            await session.commit()
            job_id = job.id

        with (
            patch.object(downloads.job_engine, "SessionLocal", self.sessions),
            patch.object(
                downloads.ytdlp_service,
                "validate_media_url",
                side_effect=ValueError("Media URL must not resolve to a private or local address"),
            ) as validate,
            patch.object(downloads.ytdlp_service, "download_media_batch") as ytdlp,
        ):
            await downloads.job_engine.run_download_job(
                job_id,
                self.user_id,
                "https://rebind.example/track",
                "audio",
            )

        async with self.sessions() as session:
            job = await session.get(Job, job_id)
        self.assertEqual(JobStatus.FAILED, job.status)
        self.assertIn("private or local", job.error_message)
        validate.assert_called_once_with("https://rebind.example/track")
        ytdlp.assert_not_called()


if __name__ == "__main__":
    unittest.main()
