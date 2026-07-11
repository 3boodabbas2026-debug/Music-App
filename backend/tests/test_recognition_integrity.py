import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.v1.endpoints import recognitions
from app.db.base import Base
from app.models.admin_event import AdminEvent  # noqa: F401 - register table metadata
from app.models.job import Job
from app.models.media import Media, MediaSource, MediaType
from app.models.playlist import Playlist, PlaylistItem  # noqa: F401 - resolve User relationships
from app.models.user import User


class RecordingUpload:
    def __init__(self, body: bytes, filename: str = "clip.m4a") -> None:
        self.filename = filename
        self._body = io.BytesIO(body)
        self.read_sizes: list[int] = []

    async def read(self, size: int) -> bytes:
        self.read_sizes.append(size)
        return self._body.read(size)


class RecognitionIntegrityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        temp_path = Path(self.temp_dir.name)
        self.settings_patch = patch.object(recognitions.settings, "media_storage_dir", temp_path)
        self.settings_patch.start()

        self.engine = create_async_engine(f"sqlite+aiosqlite:///{temp_path / 'recognitions.db'}")

        @event.listens_for(self.engine.sync_engine, "connect")
        def enable_foreign_keys(dbapi_connection, _connection_record) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False, class_=AsyncSession)

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()
        self.settings_patch.stop()
        self.temp_dir.cleanup()

    async def _seed_users_and_media(self) -> tuple[str, str, str]:
        async with self.sessions() as session:
            owner = User(email="recognition-owner@example.com", display_name="Owner", hashed_password="hash")
            stranger = User(
                email="recognition-stranger@example.com", display_name="Stranger", hashed_password="hash"
            )
            session.add_all([owner, stranger])
            await session.flush()
            media = Media(
                user_id=owner.id,
                media_type=MediaType.AUDIO,
                source=MediaSource.OTHER_URL,
                title="Private track",
                file_path=str(Path(self.temp_dir.name) / "private.mp3"),
                storage_backend="local",
            )
            session.add(media)
            await session.commit()
            return owner.id, stranger.id, media.id

    async def test_foreign_media_is_rejected_before_job_creation(self) -> None:
        _owner_id, stranger_id, media_id = await self._seed_users_and_media()

        async with self.sessions() as session:
            stranger = await session.get(User, stranger_id)
            with patch.object(recognitions.job_engine, "run_recognition_job", AsyncMock()) as worker:
                with self.assertRaises(HTTPException) as raised:
                    await recognitions.recognize(
                        file=None,
                        media_id=media_id,
                        current_user=stranger,
                        db=session,
                    )
                self.assertEqual(404, raised.exception.status_code)
                worker.assert_not_awaited()
                self.assertEqual(0, await session.scalar(select(func.count()).select_from(Job)))

    async def test_oversized_upload_is_chunked_and_leaves_no_job_or_file(self) -> None:
        owner_id, _stranger_id, _media_id = await self._seed_users_and_media()
        upload = RecordingUpload(b"abcdef", filename="sample.wav")

        async with self.sessions() as session:
            owner = await session.get(User, owner_id)
            with (
                patch.object(recognitions, "MAX_UPLOAD_BYTES", 5),
                patch.object(recognitions, "UPLOAD_CHUNK_BYTES", 4),
                patch.object(recognitions.job_engine, "run_recognition_job", AsyncMock()) as worker,
            ):
                with self.assertRaises(HTTPException) as raised:
                    await recognitions.recognize(file=upload, media_id=None, current_user=owner, db=session)
                self.assertEqual(413, raised.exception.status_code)
                worker.assert_not_awaited()
                self.assertEqual(0, await session.scalar(select(func.count()).select_from(Job)))

        self.assertEqual([4, 4], upload.read_sizes)
        upload_dir = Path(self.temp_dir.name) / "_tmp"
        self.assertEqual([], list(upload_dir.glob("*")))

    async def test_valid_upload_is_staged_before_job_and_cleaned_after_worker(self) -> None:
        owner_id, _stranger_id, _media_id = await self._seed_users_and_media()
        upload = RecordingUpload(b"valid audio", filename="sample.wav")
        observed: dict[str, object] = {}

        async def worker(job_id: str, user_id: str, path: Path, media_id: str | None, cleanup: bool) -> None:
            observed.update(
                job_id=job_id,
                user_id=user_id,
                body=path.read_bytes(),
                media_id=media_id,
                cleanup=cleanup,
                path=path,
            )

        async with self.sessions() as session:
            owner = await session.get(User, owner_id)
            with (
                patch.object(recognitions, "UPLOAD_CHUNK_BYTES", 3),
                patch.object(recognitions.job_engine, "run_recognition_job", side_effect=worker),
            ):
                result = await recognitions.recognize(file=upload, media_id=None, current_user=owner, db=session)

            self.assertEqual(1, await session.scalar(select(func.count()).select_from(Job)))

        self.assertEqual(result.id, observed["job_id"])
        self.assertEqual(owner_id, observed["user_id"])
        self.assertEqual(b"valid audio", observed["body"])
        self.assertIsNone(observed["media_id"])
        self.assertTrue(observed["cleanup"])
        self.assertFalse(Path(observed["path"]).exists())
        self.assertTrue(all(size == 3 for size in upload.read_sizes))

    async def test_job_commit_failure_removes_already_staged_upload(self) -> None:
        owner_id, _stranger_id, _media_id = await self._seed_users_and_media()
        upload = RecordingUpload(b"valid audio")

        async with self.sessions() as session:
            owner = await session.get(User, owner_id)
            with (
                patch.object(session, "commit", AsyncMock(side_effect=RuntimeError("database unavailable"))),
                patch.object(recognitions.job_engine, "run_recognition_job", AsyncMock()) as worker,
            ):
                with self.assertRaisesRegex(RuntimeError, "database unavailable"):
                    await recognitions.recognize(file=upload, media_id=None, current_user=owner, db=session)
                worker.assert_not_awaited()

        upload_dir = Path(self.temp_dir.name) / "_tmp"
        self.assertEqual([], list(upload_dir.glob("*")))
        async with self.sessions() as session:
            self.assertEqual(0, await session.scalar(select(func.count()).select_from(Job)))


if __name__ == "__main__":
    unittest.main()
