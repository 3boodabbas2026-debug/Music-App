import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.models.admin_event import AdminEvent  # noqa: F401 - register table metadata
from app.models.job import Job, JobStatus, JobType
from app.models.media import Media, MediaSource, MediaType
from app.models.playlist import Playlist, PlaylistItem  # noqa: F401 - resolve User relationships
from app.models.user import User
from app.services.recognition import shazam_service
from app.services.recognition.types import RecognitionMatch, RecognitionMode
from app.workers import job_engine


class AutoNameMediaTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        temp_path = Path(self.temp_dir.name)
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{temp_path / 'auto-name.db'}")

        @event.listens_for(self.engine.sync_engine, "connect")
        def enable_foreign_keys(dbapi_connection, _connection_record) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False, class_=AsyncSession)
        self.session_patch = patch.object(job_engine, "SessionLocal", self.sessions)
        self.session_patch.start()

        async with self.sessions() as session:
            user = User(email="auto-name@example.com", display_name="Auto Name", hashed_password="hash")
            session.add(user)
            await session.commit()
            await session.refresh(user)
            self.user_id = user.id

    async def asyncTearDown(self) -> None:
        self.session_patch.stop()
        await self.engine.dispose()
        self.temp_dir.cleanup()

    async def _seed_media(self, count: int, media_type: MediaType = MediaType.AUDIO) -> list[str]:
        async with self.sessions() as session:
            rows = [
                Media(
                    user_id=self.user_id,
                    media_type=media_type,
                    source=MediaSource.TELEGRAM,
                    title=f"A93bcD02efG45hiJ{i:02d}",
                    file_path=str(Path(self.temp_dir.name) / f"media-{i}.mp4"),
                    storage_backend="local",
                )
                for i in range(count)
            ]
            session.add_all(rows)
            await session.commit()
            return [row.id for row in rows]

    async def test_processes_every_eligible_item_beyond_old_ten_track_cap(self) -> None:
        media_ids = await self._seed_media(12)
        worker = AsyncMock()

        with patch.object(job_engine, "run_recognition_job", worker):
            await job_engine.auto_name_media(self.user_id, media_ids)

        self.assertEqual(media_ids, [call.args[3] for call in worker.await_args_list])
        self.assertTrue(all(call.kwargs["cleanup"] is False for call in worker.await_args_list))
        async with self.sessions() as session:
            self.assertEqual(12, await session.scalar(select(func.count()).select_from(Job)))

    async def test_video_is_eligible_for_existing_audio_extraction_path(self) -> None:
        [media_id] = await self._seed_media(1, MediaType.VIDEO)
        worker = AsyncMock()

        with patch.object(job_engine, "run_recognition_job", worker):
            await job_engine.auto_name_media(self.user_id, [media_id])

        worker.assert_awaited_once()
        args = worker.await_args.args
        self.assertEqual(self.user_id, args[1])
        self.assertEqual(media_id, args[3])
        self.assertEqual(Path(self.temp_dir.name) / "media-0.mp4", args[2])
        self.assertFalse(worker.await_args.kwargs["cleanup"])

    async def test_readable_telegram_title_is_enriched_when_genre_is_missing(self) -> None:
        async with self.sessions() as session:
            media = Media(
                user_id=self.user_id,
                media_type=MediaType.AUDIO,
                source=MediaSource.TELEGRAM,
                title="A perfectly readable title",
                file_path=str(Path(self.temp_dir.name) / "readable.mp3"),
                storage_backend="local",
            )
            session.add(media)
            await session.commit()
            media_id = media.id

        worker = AsyncMock()
        with patch.object(job_engine, "run_recognition_job", worker):
            await job_engine.auto_name_media(self.user_id, [media_id])

        worker.assert_awaited_once()
        self.assertEqual(media_id, worker.await_args.args[3])

    async def test_s3_media_is_materialized_only_for_recognition(self) -> None:
        async with self.sessions() as session:
            media = Media(
                user_id=self.user_id,
                media_type=MediaType.AUDIO,
                source=MediaSource.TELEGRAM,
                title="Cloud song",
                original_filename="cloud-song.m4a",
                file_path="private/cloud-object",
                storage_backend="s3",
            )
            session.add(media)
            await session.commit()
            media_id = media.id

        observed_path: Path | None = None

        def copy_to_path(_key: str, _backend: str, destination: Path) -> None:
            destination.write_bytes(b"provider sample")

        async def recognize(_job_id, _user_id, path: Path, _media_id, *, cleanup: bool) -> None:
            nonlocal observed_path
            observed_path = path
            self.assertTrue(path.exists())
            self.assertEqual(".m4a", path.suffix)
            self.assertTrue(cleanup)

        with (
            patch.object(job_engine.storage_backend, "copy_to_path", side_effect=copy_to_path),
            patch.object(job_engine, "run_recognition_job", side_effect=recognize),
        ):
            await job_engine.auto_name_media(self.user_id, [media_id])

        self.assertIsNotNone(observed_path)
        self.assertFalse(observed_path.exists())

    async def test_concurrent_batches_share_one_recognition_slot(self) -> None:
        first_ids = await self._seed_media(2)
        second_ids = await self._seed_media(2, MediaType.VIDEO)
        active = 0
        peak_active = 0

        async def worker(*_args, **_kwargs) -> None:
            nonlocal active, peak_active
            active += 1
            peak_active = max(peak_active, active)
            await asyncio.sleep(0)
            active -= 1

        with patch.object(job_engine, "run_recognition_job", side_effect=worker):
            await asyncio.gather(
                job_engine.auto_name_media(self.user_id, first_ids),
                job_engine.auto_name_media(self.user_id, second_ids),
            )

        self.assertEqual(1, peak_active)

    async def test_recognition_writes_placeholder_name_to_canonical_and_recognized_fields(self) -> None:
        media_path = Path(self.temp_dir.name) / "untitled.mp3"
        media_path.write_bytes(b"audio")
        async with self.sessions() as session:
            media = Media(
                user_id=self.user_id,
                media_type=MediaType.AUDIO,
                source=MediaSource.TELEGRAM,
                title="Untitled",
                artist="Unknown Artist",
                file_path=str(media_path),
                storage_backend="local",
            )
            job = Job(user_id=self.user_id, job_type=JobType.RECOGNIZE)
            session.add_all([media, job])
            await session.commit()
            media_id, job_id = media.id, job.id

        match = RecognitionMatch(
            title="The Real Song",
            artist="The Real Artist",
            album="The Album",
            thumbnail_url="https://img.example/cover.jpg",
            provider_key="key",
            genre="Pop",
            release_year=2024,
            provider="shazam",
            match_kind=RecognitionMode.RECORDING,
        )
        with (
            patch.object(job_engine.recognition_service, "recognize_file", AsyncMock(return_value=match)),
            patch.object(job_engine, "ensure_media_artwork", AsyncMock(return_value=True)) as persist_art,
        ):
            await job_engine.run_recognition_job(
                job_id, self.user_id, media_path, media_id, cleanup=False
            )

        async with self.sessions() as session:
            media = await session.get(Media, media_id)
            job = await session.get(Job, job_id)
        self.assertEqual("The Real Song", media.title)
        self.assertEqual("The Real Artist", media.artist)
        self.assertEqual("The Real Song", media.recognized_title)
        self.assertEqual("The Real Artist", media.recognized_artist)
        self.assertEqual("https://img.example/cover.jpg", media.thumbnail_url)
        self.assertEqual(JobStatus.COMPLETE, job.status)
        persist_art.assert_awaited_once_with(media_id, "https://img.example/cover.jpg")

    async def test_whole_library_job_processes_beyond_chunk_size_and_no_match_is_not_failure(self) -> None:
        media_ids = await self._seed_media(30)
        async with self.sessions() as session:
            job = Job(
                user_id=self.user_id,
                job_type=JobType.RECOGNIZE,
                source_url="library",
                batch_total=len(media_ids),
                batch_processed=0,
                batch_matched=0,
                batch_failed=0,
            )
            session.add(job)
            await session.commit()
            job_id = job.id

        with patch.object(job_engine, "_recognize_existing_media", AsyncMock(return_value=None)) as recognize:
            await job_engine.run_library_recognition_job(job_id, self.user_id)

        async with self.sessions() as session:
            job = await session.get(Job, job_id)
        self.assertEqual(30, recognize.await_count)
        self.assertEqual(JobStatus.COMPLETE, job.status)
        self.assertEqual(30, job.batch_processed)
        self.assertEqual(0, job.batch_matched)
        self.assertEqual(0, job.batch_failed)
        self.assertEqual("Named 0 of 30", job.stage_label)

    async def test_whole_library_freezes_candidates_after_waiting_for_shared_recognizer(self) -> None:
        media_ids = await self._seed_media(3)
        async with self.sessions() as session:
            job = Job(
                user_id=self.user_id,
                job_type=JobType.RECOGNIZE,
                source_url="library",
                batch_total=3,  # endpoint estimate before the worker gets the lock
                batch_processed=0,
                batch_matched=0,
                batch_failed=0,
            )
            session.add(job)
            await session.commit()
            job_id = job.id

        semaphore = asyncio.Semaphore(1)
        with (
            patch.object(job_engine, "_auto_name_semaphore", semaphore),
            patch.object(
                job_engine, "_recognize_existing_media", AsyncMock(return_value=None)
            ) as recognize,
        ):
            await semaphore.acquire()
            released = False
            try:
                task = asyncio.create_task(
                    job_engine.run_library_recognition_job(job_id, self.user_id)
                )
                await asyncio.sleep(0)
                async with self.sessions() as session:
                    already_named = await session.get(Media, media_ids[0])
                    already_named.recognized_title = "Named while batch waited"
                    await session.commit()
                semaphore.release()
                released = True
                await task
            finally:
                if not released:
                    semaphore.release()

        async with self.sessions() as session:
            job = await session.get(Job, job_id)
        self.assertEqual(2, recognize.await_count)
        self.assertEqual(2, job.batch_total)
        self.assertEqual(2, job.batch_processed)
        self.assertEqual(0, job.batch_failed)
        self.assertEqual("Named 0 of 2", job.stage_label)

    def test_untitled_is_eligible_for_auto_naming(self) -> None:
        self.assertTrue(job_engine.looks_like_garbage_title("Untitled"))

    def test_recognition_fallback_extracts_audio_from_video_container(self) -> None:
        commands: list[list[str]] = []

        def run(command: list[str], **_kwargs) -> SimpleNamespace:
            commands.append(command)
            Path(command[-1]).write_bytes(b"normalized audio")
            return SimpleNamespace(returncode=0, stderr="")

        with (
            patch.object(shazam_service.imageio_ffmpeg, "get_ffmpeg_exe", return_value="ffmpeg"),
            patch.object(shazam_service.subprocess, "run", side_effect=run),
        ):
            sample = shazam_service._convert_sample(Path(self.temp_dir.name) / "video.mp4")

        try:
            self.assertTrue(sample.exists())
            self.assertIn("-vn", commands[0])
            self.assertEqual(".mp3", sample.suffix)
        finally:
            sample.unlink(missing_ok=True)
            sample.parent.rmdir()


if __name__ == "__main__":
    unittest.main()
