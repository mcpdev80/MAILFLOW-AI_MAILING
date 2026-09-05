from __future__ import annotations

from uuid import uuid4

import pytest

from app.auth import RequestIdentity
from app.models.organization import Organization
from app.services.user_preferences import (
    get_user_preferences,
    update_user_preferences,
)
from app.user_preferences_schemas import UserPreferencesUpdate


async def _organization(session, prefix: str) -> Organization:
    org = Organization(name=prefix, slug=f"{prefix.lower()}-{uuid4()}", plan="free")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    return org


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

    saved = await update_user_preferences(
        session,
        user_a,
        UserPreferencesUpdate(
            locale="de",
            theme="dark",
            density="compact",
            workspace_layout="wide",
        ),
    )
    assert saved.locale == "de"
    assert saved.locale_configured is True
    assert saved.theme == "dark"
    assert saved.density == "compact"
    assert saved.workspace_layout == "wide"

    loaded_b = await get_user_preferences(session, user_b)
    assert loaded_b.locale == "en"
    assert loaded_b.locale_configured is False
    assert loaded_b.theme == "system"
    assert loaded_b.workspace_layout == "classic"


@pytest.mark.asyncio
async def test_partial_workspace_update_preserves_locale(session) -> None:
    org = await _organization(session, "Partial Preferences")
    identity = RequestIdentity(org=org, user_id="user-a")
    await update_user_preferences(session, identity, UserPreferencesUpdate(locale="es"))

    updated = await update_user_preferences(
        session,
        identity,
        UserPreferencesUpdate(theme="light", workspace_layout="vertical"),
    )

    assert updated.locale == "es"
    assert updated.locale_configured is True
    assert updated.theme == "light"
    assert updated.density == "comfortable"
    assert updated.workspace_layout == "vertical"


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
