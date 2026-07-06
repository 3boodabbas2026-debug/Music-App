"""Telethon plumbing for the in-app Telegram importer.

Clients are short-lived: every endpoint connects, does its work, and
disconnects, so the on-disk session file is the only long-lived state.
The one exception is a pending login (code sent, waiting for the user to
type it), which must keep its client instance alive in memory because
Telegram ties the code to that connection.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from telethon import TelegramClient

from app.core.config import settings
from app.models.telegram_account import TelegramAccount

SESSION_DIR = settings.media_storage_dir / "_telegram_sessions"

# user_id -> {"client": TelegramClient, "phone": str}
pending_logins: dict[str, dict[str, Any]] = {}


def session_path(user_id: str) -> Path:
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    return SESSION_DIR / f"user_{user_id}"


def make_client(account: TelegramAccount) -> TelegramClient:
    return TelegramClient(str(session_path(account.user_id)), account.api_id, account.api_hash)


async def is_authorized(account: TelegramAccount) -> bool:
    client = make_client(account)
    try:
        await client.connect()
        return await client.is_user_authorized()
    finally:
        await client.disconnect()


async def drop_pending(user_id: str) -> None:
    pending = pending_logins.pop(user_id, None)
    if pending:
        try:
            await pending["client"].disconnect()
        except Exception:  # noqa: BLE001 - best-effort cleanup
            pass
