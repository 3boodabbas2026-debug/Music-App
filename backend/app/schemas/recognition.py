from pydantic import BaseModel


class RecognitionCapabilities(BaseModel):
    recording: bool = True
    humming: bool
    humming_provider: str | None
