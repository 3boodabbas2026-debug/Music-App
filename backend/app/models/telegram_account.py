from datetime import datetime, timezone

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TelegramAccount(Base):
    """Per-user Telegram API credentials for the in-app chat importer."""

    __tablename__ = "telegram_accounts"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    api_id: Mapped[int] = mapped_column()
    api_hash: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
