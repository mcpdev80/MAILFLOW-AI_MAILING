"""API contracts for user application preferences."""

from typing import Literal

from pydantic import BaseModel

Locale = Literal["de", "en", "es"]


class UserPreferencesView(BaseModel):
    locale: Locale = "en"
    locale_configured: bool = False


class UserPreferencesUpdate(BaseModel):
    locale: Locale
