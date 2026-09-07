"""API contracts for user application preferences."""

from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator, model_validator

Locale = Literal["de", "en", "es"]
Theme = Literal["light", "dark", "system"]
Density = Literal["comfortable", "compact"]
DateFormat = Literal["DD.MM.YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]
WorkspaceLayout = Literal["classic", "vertical", "focus", "compact", "wide", "custom"]
SidePanelAlignment = Literal["left", "right"]
WorkspacePanel = Literal["accounts", "folders", "message_list", "message_content"]
WorkspaceDock = Literal["left", "center", "right", "top", "bottom"]
ActionBarDock = Literal["top", "bottom"]
SystemStatusPosition = Literal["top", "bottom", "hidden"]


class WorkspacePanelConfig(BaseModel):
    panel: WorkspacePanel
    dock: WorkspaceDock
    order: int = Field(ge=1, le=4)
    size_px: int | None = Field(default=None, ge=180, le=1600)
    visible: bool = True


class WorkspaceCustomConfig(BaseModel):
    version: Literal[1] = 1
    panels: list[WorkspacePanelConfig]
    message_content_overlay: bool = False
    show_resize_handles: bool = True
    action_bar_dock: ActionBarDock = "top"
    system_status_position: SystemStatusPosition = "top"

    @model_validator(mode="after")
    def validate_panel_set(self) -> "WorkspaceCustomConfig":
        panels = [item.panel for item in self.panels]
        orders = [item.order for item in self.panels]
        required = {"accounts", "folders", "message_list", "message_content"}
        if len(self.panels) != 4 or set(panels) != required:
            raise ValueError("workspace config must contain each panel exactly once")
        if len(set(orders)) != 4:
            raise ValueError("workspace panel order values must be unique")
        return self


class UserPreferencesView(BaseModel):
    locale: Locale = "en"
    locale_configured: bool = False
    timezone: str = "UTC"
    date_format: DateFormat = "YYYY-MM-DD"
    theme: Theme = "system"
    density: Density = "comfortable"
    workspace_layout: WorkspaceLayout = "classic"
    side_panel_alignment: SidePanelAlignment = "left"
    workspace_custom_config: WorkspaceCustomConfig | None = None
    remote_content_senders: list[str] = Field(default_factory=list)


class UserPreferencesUpdate(BaseModel):
    locale: Locale | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    date_format: DateFormat | None = None
    theme: Theme | None = None
    density: Density | None = None
    workspace_layout: WorkspaceLayout | None = None
    side_panel_alignment: SidePanelAlignment | None = None
    workspace_custom_config: WorkspaceCustomConfig | None = None
    remote_content_senders: list[str] | None = Field(default=None, max_length=500)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("timezone must be a valid IANA time zone") from exc
        return value

    @field_validator("remote_content_senders")
    @classmethod
    def validate_remote_content_senders(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        result: list[str] = []
        for item in value:
            normalized = item.strip().lower()
            if not normalized or "@" not in normalized or len(normalized) > 320:
                continue
            if normalized not in result:
                result.append(normalized)
        return result
