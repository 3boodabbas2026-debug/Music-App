from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="SMA_")

    app_name: str = "Super Media App API"
    secret_key: str = "dev-only-secret-change-me"
    access_token_expire_minutes: int = 60 * 24
    refresh_token_expire_minutes: int = 60 * 24 * 30
    jwt_algorithm: str = "HS256"

    database_url: str = f"sqlite+aiosqlite:///{BACKEND_ROOT / 'super_media_app.db'}"
    media_storage_dir: Path = BACKEND_ROOT / "media_storage"

    cors_origins: list[str] = ["*"]
    registration_invite_code: str | None = None
    ytdlp_cookies_b64: str | None = None
    ytdlp_cookies_file: str | None = None

    max_concurrent_downloads: int = 3
    recognition_timeout_seconds: int = 25


settings = Settings()
settings.media_storage_dir.mkdir(parents=True, exist_ok=True)
