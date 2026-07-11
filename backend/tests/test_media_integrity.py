import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.v1.endpoints import library
from app.db.base import Base
from app.models.admin_event import AdminEvent
from app.models.job import Job, JobStatus, JobType
from app.models.media import Media, MediaSource, MediaType
from app.models.playlist import Playlist, PlaylistItem
from app.models.user import User
from app.schemas.media import MediaUpdate


class MediaIntegrityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        db_path = Path(self.temp_dir.name) / "integrity.db"
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")

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
        self.temp_dir.cleanup()

    async def _seed_referenced_media(self) -> dict[str, str | Path]:
        media_path = Path(self.temp_dir.name) / "track.mp3"
        media_path.write_bytes(b"audio bytes")
        thumbnail_path = Path(f"{media_path}.thumb.jpg")
        thumbnail_path.write_bytes(b"thumbnail bytes")

        async with self.sessions() as session:
            owner = User(email="owner@example.com", display_name="Owner", hashed_password="hash")
            stranger = User(email="stranger@example.com", display_name="Stranger", hashed_password="hash")
            session.add_all([owner, stranger])
            await session.flush()

            target = Media(
                user_id=owner.id,
                media_type=MediaType.AUDIO,
                source=MediaSource.OTHER_URL,
                title="Target",
                file_path=str(media_path),
                storage_backend="local",
            )
            survivor = Media(
                user_id=owner.id,
                media_type=MediaType.AUDIO,
                source=MediaSource.OTHER_URL,
                title="Survivor",
                file_path=str(Path(self.temp_dir.name) / "survivor.mp3"),
                storage_backend="local",
            )
            session.add_all([target, survivor])
            await session.flush()

            playlist = Playlist(user_id=owner.id, name="Mix")
            session.add(playlist)
            await session.flush()
            session.add_all(
                [
                    PlaylistItem(playlist_id=playlist.id, media_id=target.id, position=0),
                    PlaylistItem(playlist_id=playlist.id, media_id=survivor.id, position=1),
                    Job(
                        user_id=owner.id,
                        job_type=JobType.DOWNLOAD,
                        status=JobStatus.COMPLETE,
                        result_media_id=target.id,
                    ),
                ]
            )
            await session.commit()
            return {
                "owner_id": owner.id,
                "stranger_id": stranger.id,
                "media_id": target.id,
                "survivor_id": survivor.id,
                "playlist_id": playlist.id,
                "media_path": media_path,
                "thumbnail_path": thumbnail_path,
            }

    async def test_delete_resolves_references_then_removes_local_files(self) -> None:
        seeded = await self._seed_referenced_media()

        async with self.sessions() as session:
            owner = await session.get(User, seeded["owner_id"])
            await library.delete_media(str(seeded["media_id"]), owner, session)

        self.assertFalse(Path(seeded["media_path"]).exists())
        self.assertFalse(Path(seeded["thumbnail_path"]).exists())

        async with self.sessions() as session:
            self.assertIsNone(await session.get(Media, seeded["media_id"]))
            self.assertEqual(
                0,
                await session.scalar(
                    select(func.count()).select_from(PlaylistItem).where(PlaylistItem.media_id == seeded["media_id"])
                ),
            )
            survivor_link = await session.scalar(
                select(PlaylistItem).where(
                    PlaylistItem.playlist_id == seeded["playlist_id"],
                    PlaylistItem.media_id == seeded["survivor_id"],
                )
            )
            self.assertEqual(0, survivor_link.position)
            job = await session.scalar(select(Job).where(Job.user_id == seeded["owner_id"]))
            self.assertIsNone(job.result_media_id)
            event_row = await session.scalar(select(AdminEvent).where(AdminEvent.event_type == "media_deleted"))
            self.assertIsNotNone(event_row)

    async def test_commit_failure_rolls_back_before_storage_cleanup(self) -> None:
        seeded = await self._seed_referenced_media()

        async with self.sessions() as session:
            owner = await session.get(User, seeded["owner_id"])
            failed_commit = AsyncMock(side_effect=RuntimeError("database unavailable"))
            with (
                patch.object(session, "commit", failed_commit),
                patch.object(library.storage_backend, "delete_file") as delete_file,
            ):
                with self.assertRaisesRegex(RuntimeError, "database unavailable"):
                    await library.delete_media(str(seeded["media_id"]), owner, session)
                delete_file.assert_not_called()

        self.assertTrue(Path(seeded["media_path"]).exists())
        self.assertTrue(Path(seeded["thumbnail_path"]).exists())
        async with self.sessions() as session:
            self.assertIsNotNone(await session.get(Media, seeded["media_id"]))
            self.assertEqual(
                1,
                await session.scalar(
                    select(func.count()).select_from(PlaylistItem).where(PlaylistItem.media_id == seeded["media_id"])
                ),
            )
            job = await session.scalar(select(Job).where(Job.user_id == seeded["owner_id"]))
            self.assertEqual(seeded["media_id"], job.result_media_id)

    async def test_other_user_cannot_delete_media_or_files(self) -> None:
        seeded = await self._seed_referenced_media()

        async with self.sessions() as session:
            stranger = await session.get(User, seeded["stranger_id"])
            with patch.object(library.storage_backend, "delete_file") as delete_file:
                with self.assertRaises(HTTPException) as raised:
                    await library.delete_media(str(seeded["media_id"]), stranger, session)
                self.assertEqual(404, raised.exception.status_code)
                delete_file.assert_not_called()

        self.assertTrue(Path(seeded["media_path"]).exists())
        async with self.sessions() as session:
            self.assertIsNotNone(await session.get(Media, seeded["media_id"]))

    async def test_storage_failure_does_not_undo_committed_deletion(self) -> None:
        seeded = await self._seed_referenced_media()

        async with self.sessions() as session:
            owner = await session.get(User, seeded["owner_id"])
            with (
                self.assertLogs(library.logger, level="ERROR") as logs,
                patch.object(library.storage_backend, "delete_file", side_effect=RuntimeError("object store down")),
            ):
                await library.delete_media(str(seeded["media_id"]), owner, session)

        self.assertTrue(any("storage cleanup failed" in message for message in logs.output))
        self.assertTrue(Path(seeded["media_path"]).exists())
        self.assertFalse(Path(seeded["thumbnail_path"]).exists())
        async with self.sessions() as session:
            self.assertIsNone(await session.get(Media, seeded["media_id"]))

    async def test_rename_failure_rolls_back_metadata_change(self) -> None:
        seeded = await self._seed_referenced_media()

        async with self.sessions() as session:
            owner = await session.get(User, seeded["owner_id"])
            with patch.object(session, "commit", AsyncMock(side_effect=RuntimeError("commit failed"))):
                with self.assertRaisesRegex(RuntimeError, "commit failed"):
                    await library.update_media(
                        str(seeded["media_id"]), MediaUpdate(title="Renamed"), owner, session
                    )

        async with self.sessions() as session:
            media = await session.get(Media, seeded["media_id"])
            self.assertEqual("Target", media.title)


if __name__ == "__main__":
    unittest.main()
