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
    every startup; never touches existing data."""
    from sqlalchemy import inspect, text

    def existing_media_columns(sync_conn) -> set[str]:
        return {col["name"] for col in inspect(sync_conn).get_columns("media")}

    columns = await conn.run_sync(existing_media_columns)
    if not columns:
        return  # table doesn't exist yet — create_all (called right before this) will make it with every column already
    is_sqlite = engine.url.get_backend_name() == "sqlite"
    additions = {
        "genre": "VARCHAR(100)",
        "release_year": "INTEGER",
        "is_remix": "BOOLEAN",
    }
    for column, coltype in additions.items():
        if column in columns:
            continue
        ddl = f"ALTER TABLE media ADD COLUMN {column} {coltype}"
        if not is_sqlite:
            ddl = f"ALTER TABLE media ADD COLUMN IF NOT EXISTS {column} {coltype}"
        await conn.execute(text(ddl))


async def init_models() -> None:
    from app.db.base import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _add_missing_columns(conn)
