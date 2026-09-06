"""API contracts for user application preferences."""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

Locale = Literal["de", "en", "es"]
Theme = Literal["light", "dark", "system"]
Density = Literal["comfortable", "compact"]
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
    theme: Theme = "system"
    density: Density = "comfortable"
    workspace_layout: WorkspaceLayout = "classic"
    side_panel_alignment: SidePanelAlignment = "left"
    workspace_custom_config: WorkspaceCustomConfig | None = None


class UserPreferencesUpdate(BaseModel):
    locale: Locale | None = None
    theme: Theme | None = None
    density: Density | None = None
    workspace_layout: WorkspaceLayout | None = None
    side_panel_alignment: SidePanelAlignment | None = None
    workspace_custom_config: WorkspaceCustomConfig | None = None
