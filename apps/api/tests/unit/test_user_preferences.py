from __future__ import annotations

from uuid import uuid4

import pytest

from app.auth import RequestIdentity
from app.models.organization import Organization
from app.services.user_preferences import (
    get_user_preferences,
    update_user_preferences,
)
from app.user_preferences_schemas import (
    UserPreferencesUpdate,
    WorkspaceCustomConfig,
    WorkspacePanelConfig,
)


async def _organization(session, prefix: str) -> Organization:
    org = Organization(name=prefix, slug=f"{prefix.lower()}-{uuid4()}", plan="free")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    return org


def _custom_layout() -> WorkspaceCustomConfig:
    return WorkspaceCustomConfig(
        panels=[
            WorkspacePanelConfig(panel="accounts", dock="left", order=1, size_px=220),
            WorkspacePanelConfig(panel="folders", dock="left", order=2, size_px=240),
            WorkspacePanelConfig(panel="message_list", dock="center", order=3, size_px=360),
            WorkspacePanelConfig(panel="message_content", dock="right", order=4),
        ],
        message_content_overlay=True,
        show_resize_handles=True,
    )


@pytest.mark.asyncio
async def test_preferences_default_then_persist_per_user(session) -> None:
    org = await _organization(session, "Preferences")
    user_a = RequestIdentity(org=org, user_id="user-a")
    user_b = RequestIdentity(org=org, user_id="user-b")

    initial = await get_user_preferences(session, user_a)
    assert initial.locale == "en"
    assert initial.locale_configured is False
    assert initial.theme == "system"
    assert initial.density == "comfortable"
    assert initial.workspace_layout == "classic"
    assert initial.side_panel_alignment == "left"
    assert initial.workspace_custom_config is None

    saved = await update_user_preferences(
        session,
        user_a,
        UserPreferencesUpdate(
            locale="de",
            theme="dark",
            density="compact",
            workspace_layout="custom",
            side_panel_alignment="right",
            workspace_custom_config=_custom_layout(),
        ),
    )
    assert saved.locale == "de"
    assert saved.locale_configured is True
    assert saved.theme == "dark"
    assert saved.density == "compact"
    assert saved.workspace_layout == "custom"
    assert saved.side_panel_alignment == "right"
    assert saved.workspace_custom_config is not None
    assert saved.workspace_custom_config.panels[2].panel == "message_list"
    assert saved.workspace_custom_config.message_content_overlay is True

    loaded_b = await get_user_preferences(session, user_b)
    assert loaded_b.locale == "en"
    assert loaded_b.locale_configured is False
    assert loaded_b.theme == "system"
    assert loaded_b.workspace_layout == "classic"
    assert loaded_b.side_panel_alignment == "left"
    assert loaded_b.workspace_custom_config is None


@pytest.mark.asyncio
async def test_partial_workspace_update_preserves_locale(session) -> None:
    org = await _organization(session, "Partial Preferences")
    identity = RequestIdentity(org=org, user_id="user-a")
    await update_user_preferences(session, identity, UserPreferencesUpdate(locale="es"))

    updated = await update_user_preferences(
        session,
        identity,
        UserPreferencesUpdate(
            theme="light",
            workspace_layout="vertical",
            side_panel_alignment="right",
        ),
    )

    assert updated.locale == "es"
    assert updated.locale_configured is True
    assert updated.theme == "light"
    assert updated.density == "comfortable"
    assert updated.workspace_layout == "vertical"
    assert updated.side_panel_alignment == "right"


@pytest.mark.asyncio
async def test_custom_workspace_config_can_be_cleared(session) -> None:
    org = await _organization(session, "Reset Workspace")
    identity = RequestIdentity(org=org, user_id="user-a")
    await update_user_preferences(
        session,
        identity,
        UserPreferencesUpdate(
            workspace_layout="custom",
            workspace_custom_config=_custom_layout(),
        ),
    )

    updated = await update_user_preferences(
        session,
        identity,
        UserPreferencesUpdate(
            workspace_layout="classic",
            workspace_custom_config=None,
        ),
    )

    assert updated.workspace_layout == "classic"
    assert updated.workspace_custom_config is None


@pytest.mark.asyncio
async def test_single_user_preferences_use_stable_actor_key(session) -> None:
    org = await _organization(session, "Single Preferences")
    identity = RequestIdentity(org=org, user_id=None)
    await update_user_preferences(
        session,
        identity,
        UserPreferencesUpdate(locale="es", theme="dark", density="compact"),
    )

    loaded = await get_user_preferences(session, identity)
    assert loaded.locale == "es"
    assert loaded.locale_configured is True
    assert loaded.theme == "dark"
    assert loaded.density == "compact"
    assert loaded.side_panel_alignment == "left"


def test_custom_workspace_requires_each_panel_once() -> None:
    with pytest.raises(ValueError, match="each panel exactly once"):
        WorkspaceCustomConfig(
            panels=[
                WorkspacePanelConfig(panel="accounts", dock="left", order=1),
                WorkspacePanelConfig(panel="folders", dock="left", order=2),
                WorkspacePanelConfig(panel="message_list", dock="center", order=3),
                WorkspacePanelConfig(panel="message_list", dock="right", order=4),
            ]
        )
