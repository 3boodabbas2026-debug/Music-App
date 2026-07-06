from pydantic import BaseModel, Field


class TelegramSettingsIn(BaseModel):
    api_id: int
    api_hash: str = Field(min_length=8, max_length=200)
    phone: str = Field(min_length=5, max_length=40)


class TelegramCodeIn(BaseModel):
    code: str = Field(min_length=3, max_length=10)


class TelegramPasswordIn(BaseModel):
    password: str = Field(min_length=1, max_length=256)


class TelegramImportIn(BaseModel):
    chat: str = Field(min_length=1, max_length=200)
    media_kind: str = "music"  # "music" | "video"
    limit: int = Field(default=25, ge=1, le=100)


class TelegramStatusOut(BaseModel):
    configured: bool
    authorized: bool
    phone: str | None = None


class TelegramDialogOut(BaseModel):
    id: str
    title: str
    username: str | None = None
