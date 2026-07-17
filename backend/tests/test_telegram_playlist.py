import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.models.admin_event import AdminEvent  # noqa: F401 - register metadata
from app.models.job import Job  # noqa: F401 - resolve User relationships
from app.models.media import Media, MediaSource, MediaType
from app.models.playlist import Playlist, PlaylistItem
from app.models.user import User
from app.workers import job_engine


class TelegramPlaylistTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.engine = create_async_engine(
            f"sqlite+aiosqlite:///{Path(self.temp_dir.name) / 'telegram-playlist.db'}"
        )

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
            user = User(email="telegram-list@example.com", display_name="Telegram", hashed_password="hash")
            session.add(user)
            await session.flush()
            media = [
                Media(
                    user_id=user.id,
                    media_type=MediaType.AUDIO,
                    source=MediaSource.TELEGRAM,
                    title=f"Song {index}",
                    file_path=str(Path(self.temp_dir.name) / f"song-{index}.mp3"),
                    storage_backend="local",
                )
                for index in range(2)
            ]
            session.add_all(media)
            await session.commit()
            self.user_id = user.id
            self.media_ids = [item.id for item in media]

    async def asyncTearDown(self) -> None:
        self.session_patch.stop()
        await self.engine.dispose()
        self.temp_dir.cleanup()

    async def test_auto_playlist_is_created_and_membership_is_idempotent(self) -> None:
        await job_engine.ensure_telegram_playlist_item(self.user_id, self.media_ids[0])
        await job_engine.ensure_telegram_playlist_item(self.user_id, self.media_ids[0])
        await job_engine.ensure_telegram_playlist_item(self.user_id, self.media_ids[1])

        async with self.sessions() as session:
            playlists = list(
                (
                    await session.scalars(
                        select(Playlist).where(Playlist.user_id == self.user_id)
                    )
                ).all()
            )
            items = list(
                (
                    await session.scalars(
                        select(PlaylistItem).order_by(PlaylistItem.position)
                    )
                ).all()
            )

        self.assertEqual(1, len(playlists))
        self.assertEqual("Telegram", playlists[0].name)
        self.assertEqual("telegram", playlists[0].system_key)
        self.assertEqual(self.media_ids, [item.media_id for item in items])
        self.assertEqual([0, 1], [item.position for item in items])

    async def test_existing_named_playlist_is_adopted_instead_of_duplicated(self) -> None:
        async with self.sessions() as session:
            session.add(Playlist(user_id=self.user_id, name="telegram"))
            await session.commit()

        await job_engine.ensure_telegram_playlist_item(self.user_id, self.media_ids[0])

        async with self.sessions() as session:
            count = await session.scalar(
                select(func.count()).select_from(Playlist).where(Playlist.user_id == self.user_id)
            )
            playlist = await session.scalar(
                select(Playlist).where(Playlist.user_id == self.user_id)
            )
        self.assertEqual(1, count)
        self.assertEqual("telegram", playlist.system_key)


if __name__ == "__main__":
    unittest.main()
