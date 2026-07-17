import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.v1.endpoints import activity, library
from app.db.base import Base
from app.models.admin_event import AdminEvent  # noqa: F401 - register metadata
from app.models.job import Job  # noqa: F401 - resolve User relationships
from app.models.media import Media, MediaSource, MediaType
from app.models.media_state import MediaState
from app.models.playlist import Playlist, PlaylistItem
from app.models.user import User


class LibraryFilterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.engine = create_async_engine(
            f"sqlite+aiosqlite:///{Path(self.temp_dir.name) / 'filters.db'}"
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
            user = User(email="filters@example.com", display_name="Filters", hashed_password="hash")
            session.add(user)
            await session.flush()
            named = Media(
                user_id=user.id,
                media_type=MediaType.AUDIO,
                source=MediaSource.TELEGRAM,
                title="Untitled",
                artist=None,
                recognized_title="Named Telegram Song",
                recognized_artist="Alice Artist",
                duration_seconds=180,
                created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
                file_path=str(Path(self.temp_dir.name) / "named.mp3"),
                storage_backend="local",
            )
            unnamed = Media(
                user_id=user.id,
                media_type=MediaType.AUDIO,
                source=MediaSource.YOUTUBE,
                title="Untitled",
                duration_seconds=60,
                created_at=datetime(2026, 1, 10, tzinfo=timezone.utc),
                file_path=str(Path(self.temp_dir.name) / "unnamed.mp3"),
                storage_backend="local",
            )
            uploaded = Media(
                user_id=user.id,
                media_type=MediaType.VIDEO,
                source=MediaSource.RECOGNIZED_UPLOAD,
                title="Uploaded clip",
                artist="Bob",
                duration_seconds=240,
                created_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
                file_path=str(Path(self.temp_dir.name) / "upload.mp4"),
                storage_backend="local",
            )
            session.add_all([named, unnamed, uploaded])
            await session.flush()
            playlist = Playlist(user_id=user.id, name="Mix")
            session.add(playlist)
            await session.flush()
            played_at = datetime(2026, 1, 11, tzinfo=timezone.utc)
            session.add_all(
                [
                    PlaylistItem(playlist_id=playlist.id, media_id=named.id, position=0),
                    MediaState(
                        user_id=user.id,
                        media_id=named.id,
                        favorite=True,
                        last_position_seconds=10,
                        last_played_at=played_at,
                    ),
                    MediaState(
                        user_id=user.id,
                        media_id=unnamed.id,
                        favorite=False,
                        last_position_seconds=42,
                        last_played_at=played_at,
                    ),
                ]
            )
            await session.commit()
            self.user_id = user.id
            self.named_id = named.id
            self.unnamed_id = unnamed.id
            self.uploaded_id = uploaded.id
            self.playlist_id = playlist.id
            self.played_at = played_at

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()
        self.temp_dir.cleanup()

    async def test_filters_are_combined_with_and_semantics(self) -> None:
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            result = await library.list_library(
                source="telegram",
                media_type="audio",
                named=True,
                favorite=True,
                min_duration=120,
                max_duration=200,
                added_after=datetime(2026, 1, 1, tzinfo=timezone.utc),
                added_before=datetime(2026, 1, 3, tzinfo=timezone.utc),
                artist="alice",
                playlist_id=self.playlist_id,
                current_user=user,
                db=session,
            )
        self.assertEqual([self.named_id], [item.id for item in result])

    async def test_named_and_virtual_source_aliases_use_real_metadata(self) -> None:
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            unnamed = await library.list_library(named=False, current_user=user, db=session)
            recognized = await library.list_library(source="recognized", current_user=user, db=session)
            uploaded = await library.list_library(source="uploaded", current_user=user, db=session)

        self.assertEqual([self.unnamed_id], [item.id for item in unnamed])
        self.assertEqual([self.named_id], [item.id for item in recognized])
        self.assertEqual([self.uploaded_id], [item.id for item in uploaded])

    async def test_invalid_range_and_source_are_rejected(self) -> None:
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            with self.assertRaises(HTTPException) as source_error:
                await library.list_library(source="not-real", current_user=user, db=session)
            with self.assertRaises(HTTPException) as range_error:
                await library.list_library(
                    min_duration=20, max_duration=10, current_user=user, db=session
                )
        self.assertEqual(422, source_error.exception.status_code)
        self.assertEqual(422, range_error.exception.status_code)

    async def test_favorite_only_update_preserves_playback_progress(self) -> None:
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            await activity.update_media_state(
                self.unnamed_id,
                activity.PlaybackUpdate(favorite=True),
                user,
                session,
            )
            state = await session.scalar(
                select(MediaState).where(
                    MediaState.user_id == self.user_id,
                    MediaState.media_id == self.unnamed_id,
                )
            )

        self.assertTrue(state.favorite)
        self.assertEqual(42, state.last_position_seconds)
        self.assertEqual(self.played_at.replace(tzinfo=None), state.last_played_at)


if __name__ == "__main__":
    unittest.main()
