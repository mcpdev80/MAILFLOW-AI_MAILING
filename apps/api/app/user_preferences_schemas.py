"""API contracts for user application preferences."""

from typing import Literal

from pydantic import BaseModel

Locale = Literal["de", "en", "es"]
Theme = Literal["light", "dark", "system"]
Density = Literal["comfortable", "compact"]
WorkspaceLayout = Literal["classic", "vertical", "focus", "compact", "wide"]


class UserPreferencesView(BaseModel):
    locale: Locale = "en"
    locale_configured: bool = False
    theme: Theme = "system"
    density: Density = "comfortable"
    workspace_layout: WorkspaceLayout = "classic"


class UserPreferencesUpdate(BaseModel):
    locale: Locale
    theme: Theme = "system"
    density: Density = "comfortable"
    workspace_layout: WorkspaceLayout = "classic"
