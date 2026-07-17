from collections.abc import AsyncGenerator
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# libpq-style query params (sslmode, channel_binding, ...) that connection
# strings copy-pasted from Postgres dashboards (Neon, Supabase, ...) often
# include — asyncpg's connect() doesn't recognize them and raises if they're
# forwarded as kwargs. TLS is handled explicitly below instead.
_UNSUPPORTED_ASYNCPG_QUERY_PARAMS = {"sslmode", "channel_binding"}


def _sanitize_database_url(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.scheme.startswith(("postgresql", "postgres")):
        return url
    # Providers' dashboards hand out plain "postgresql://"/"postgres://" —
    # normalize to the async driver so a straight copy-paste still works.
    if "+" not in parsed.scheme:
        parsed = parsed._replace(scheme="postgresql+asyncpg")
    kept = [(k, v) for k, v in parse_qsl(parsed.query) if k not in _UNSUPPORTED_ASYNCPG_QUERY_PARAMS]
    return urlunparse(parsed._replace(query=urlencode(kept)))


_database_url = _sanitize_database_url(settings.database_url)

_connect_args: dict = {}
if _database_url.startswith(("postgresql", "postgres")):
    # Managed Postgres (Neon and most others) requires TLS. asyncpg's `ssl`
    # param wants a bool/SSLContext, which we set directly here.
    _connect_args["ssl"] = True

engine = create_async_engine(_database_url, echo=False, connect_args=_connect_args)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def _add_missing_columns(conn) -> None:
    """`create_all` below only creates missing TABLES, never adds columns to
    ones that already exist — so a model change like adding `Media.genre`
    would silently no-op against a live database that predates it. This adds
    exactly the columns new enough to not be in create_all's original run,
    each guarded so it's a no-op (not an error) once applied. Safe to run
    every startup; never touches existing data (besides the one-time
    storage_backend backfill below, which only fills newly-NULL rows)."""
    from sqlalchemy import inspect, text

    def existing_columns(sync_conn, table: str) -> set[str]:
        return {col["name"] for col in inspect(sync_conn).get_columns(table)}

    is_sqlite = engine.url.get_backend_name() == "sqlite"

    async def add_columns(table: str, additions: dict[str, str]) -> set[str]:
        columns = await conn.run_sync(lambda c: existing_columns(c, table))
        if not columns:
            return set()  # table doesn't exist yet — create_all already made it with every column
        added = set()
        for column, coltype in additions.items():
            if column in columns:
                continue
            ddl = f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"
            if not is_sqlite:
                ddl = f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {coltype}"
            await conn.execute(text(ddl))
            added.add(column)
        return added

    media_added = await add_columns(
        "media",
        {
            "genre": "VARCHAR(100)",
            "release_year": "INTEGER",
            "is_remix": "BOOLEAN",
            "storage_backend": "VARCHAR(10)",
            "fade_in_ms": "INTEGER",
            "fade_out_ms": "INTEGER",
            # TIMESTAMPTZ, not TIMESTAMP — Media.fades_analyzed_at is a
            # tz-aware DateTime(timezone=True); a plain TIMESTAMP column on
            # Postgres is timezone-*naive* and asyncpg rejects inserting an
            # aware datetime into it (the exact bug already hit once with
            # created_at/updated_at — see the timezone fix in the git log).
            # SQLite accepts any type-affinity string, so this is safe there too.
            "fades_analyzed_at": "TIMESTAMPTZ",
            "original_filename": "VARCHAR(500)",
            "mime_type": "VARCHAR(200)",
            "telegram_chat_id": "VARCHAR(100)",
            "telegram_message_id": "VARCHAR(100)",
            "artwork_path": "TEXT",
            "artwork_mime_type": "VARCHAR(100)",
        },
    )
    if "storage_backend" in media_added:
        # local_storage.adopt_file() returns an absolute filesystem path
        # ("/…" or "C:\…"); s3_storage.adopt_file() returns a bare
        # "<user_id>/<uuid><suffix>" key. The two shapes never collide, so
        # this infers each existing row's real backend instead of guessing.
        await conn.execute(
            text(
                "UPDATE media SET storage_backend = CASE "
                "WHEN file_path LIKE '/%' OR file_path LIKE '%:%' THEN 'local' "
                "ELSE 's3' END WHERE storage_backend IS NULL"
            )
        )

    await add_columns("users", {"storage_preference": "VARCHAR(10)", "role": "VARCHAR(20)"})
    await add_columns(
        "telegram_accounts",
        {"api_hash_encrypted": "TEXT", "phone_encrypted": "TEXT", "session_encrypted": "TEXT"},
    )
    await add_columns(
        "jobs",
        {
            "request_payload": "TEXT",
            "attempt_count": "INTEGER DEFAULT 0 NOT NULL",
            "priority": "INTEGER DEFAULT 0 NOT NULL",
            "batch_total": "INTEGER",
            "batch_processed": "INTEGER",
            "batch_matched": "INTEGER",
            "batch_failed": "INTEGER",
        },
    )
    await add_columns("playlists", {"system_key": "VARCHAR(50)"})

    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_media_user_created ON media (user_id, created_at)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_media_user_type ON media (user_id, media_type)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_jobs_user_status ON jobs (user_id, status)"))
    await conn.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_playlist_system_key "
            "ON playlists (user_id, system_key)"
        )
    )
    # Older clients allowed the same media link to be added repeatedly. Keep
    # the earliest-positioned link before enforcing idempotent membership.
    await conn.execute(
        text(
            "DELETE FROM playlist_items WHERE id IN ("
            "SELECT id FROM ("
            "SELECT id, ROW_NUMBER() OVER ("
            "PARTITION BY playlist_id, media_id ORDER BY position, id"
            ") AS duplicate_rank FROM playlist_items"
            ") ranked WHERE duplicate_rank > 1"
            ")"
        )
    )
    await conn.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_playlist_media "
            "ON playlist_items (playlist_id, media_id)"
        )
    )
    await conn.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_telegram_message "
            "ON media (user_id, telegram_chat_id, telegram_message_id)"
        )
    )


async def init_models() -> None:
    from app.db.base import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _add_missing_columns(conn)
