from __future__ import annotations

from uuid import uuid4

import pytest

from app.auth import RequestIdentity
from app.models.organization import Organization
from app.services.user_preferences import get_user_preferences, update_user_preferences
from app.user_preferences_schemas import UserPreferencesUpdate


@pytest.mark.asyncio
async def test_locale_defaults_then_persists_per_user(session) -> None:
    org = Organization(name="Locale Test", slug=f"locale-{uuid4()}", plan="free")
    session.add(org)
    await session.commit()
    await session.refresh(org)

    user_a = RequestIdentity(org=org, user_id="user-a")
    user_b = RequestIdentity(org=org, user_id="user-b")

    initial = await get_user_preferences(session, user_a)
    assert initial.locale == "en"
    assert initial.locale_configured is False

    saved = await update_user_preferences(
        session, user_a, UserPreferencesUpdate(locale="de")
    )
    assert saved.locale == "de"
    assert saved.locale_configured is True

    loaded_a = await get_user_preferences(session, user_a)
    loaded_b = await get_user_preferences(session, user_b)
    assert loaded_a.locale == "de"
    assert loaded_a.locale_configured is True
    assert loaded_b.locale == "en"
    assert loaded_b.locale_configured is False


@pytest.mark.asyncio
async def test_single_user_locale_uses_stable_actor_key(session) -> None:
    org = Organization(name="Single Locale", slug=f"locale-single-{uuid4()}", plan="free")
    session.add(org)
    await session.commit()
    await session.refresh(org)

    identity = RequestIdentity(org=org, user_id=None)
    await update_user_preferences(session, identity, UserPreferencesUpdate(locale="es"))

    loaded = await get_user_preferences(session, identity)
    assert loaded.locale == "es"
    assert loaded.locale_configured is True
