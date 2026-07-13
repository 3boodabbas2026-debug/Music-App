from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="SMA_")

    app_name: str = "Starhollow API"
    secret_key: str = "dev-only-secret-change-me"
    access_token_expire_minutes: int = 60 * 24
    refresh_token_expire_minutes: int = 60 * 24 * 30
    jwt_algorithm: str = "HS256"
    auth_login_attempts: int = 10
    auth_login_window_seconds: int = 15 * 60
    auth_register_attempts: int = 5
    auth_register_window_seconds: int = 60 * 60
    auth_refresh_attempts: int = 30
    auth_refresh_window_seconds: int = 60

    database_url: str = f"sqlite+aiosqlite:///{BACKEND_ROOT / 'super_media_app.db'}"
    media_storage_dir: Path = BACKEND_ROOT / "media_storage"

    cors_origins: list[str] = ["*"]
    registration_invite_code: str | None = None
    # Gates the /admin/* endpoints and the in-app admin dashboard — a normal
    # registered account whose email matches this one gets admin access, no
    # separate role/permission system. Unset by default (nobody is admin).
    admin_email: str | None = None
    ytdlp_cookies_text: str | None = None
    ytdlp_cookies_b64: str | None = None
    ytdlp_cookies_file: str | None = None
    ytdlp_impersonate: str | None = "chrome"
    ytdlp_proxy_url: str | None = None
    ytdlp_youtube_player_clients: str | None = None
    ytdlp_youtube_visitor_data: str | None = None
    ytdlp_youtube_po_token: str | None = None

    max_concurrent_downloads: int = 3
    recognition_timeout_seconds: int = 25
    # Optional melody-recognition provider. The ACRCloud project must use the
    # ACRCloud Music bucket with Cover Song (humming) Identification enabled.
    acrcloud_host: str | None = None
    acrcloud_access_key: str | None = None
    acrcloud_access_secret: str | None = None

    @property
    def acrcloud_humming_configured(self) -> bool:
        return all(
            value is not None and bool(value.strip())
            for value in (self.acrcloud_host, self.acrcloud_access_key, self.acrcloud_access_secret)
        )

    # Media storage backend: "local" keeps files on this instance's disk
    # (fine for local dev, wiped on every Render free-tier redeploy/restart).
    # "s3" uploads to an S3-compatible bucket (e.g. Cloudflare R2) instead —
    # see app/services/storage/backend.py.
    storage_backend: str = "local"
    s3_endpoint_url: str | None = None
    s3_region: str = "auto"
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_bucket: str | None = None


settings = Settings()
settings.media_storage_dir.mkdir(parents=True, exist_ok=True)
