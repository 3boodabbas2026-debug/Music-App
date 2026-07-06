from datetime import datetime

from pydantic import BaseModel

from app.schemas.media import MediaOut


class PlaylistCreate(BaseModel):
    name: str


class PlaylistItemAdd(BaseModel):
    media_id: str


class PlaylistOut(BaseModel):
    id: str
    name: str
    created_at: datetime
    items: list[MediaOut] = []

    model_config = {"from_attributes": True}
