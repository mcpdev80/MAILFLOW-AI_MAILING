"""Configuration for persistent attachment-library storage."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AttachmentLibrarySettings(BaseSettings):
    ATTACHMENT_LIBRARY_ENABLED: bool = True
    ATTACHMENT_LIBRARY_STORAGE_PATH: str = "/data/attachments"
    ATTACHMENT_LIBRARY_MAX_BYTES: int = Field(default=25 * 1024 * 1024, gt=0)
    ATTACHMENT_LIBRARY_MAX_EXTRACTED_CHARS: int = Field(default=32_000, gt=0)
    # A dedicated document-model request is only justified when the cheap
    # metadata pass is below this confidence and there is meaningful extracted text.
    ATTACHMENT_LIBRARY_AI_THRESHOLD: float = Field(default=0.80, ge=0.0, le=1.0)
    ATTACHMENT_LIBRARY_AI_MIN_TEXT_CHARS: int = Field(default=120, ge=1)

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )


attachment_library_settings = AttachmentLibrarySettings()
