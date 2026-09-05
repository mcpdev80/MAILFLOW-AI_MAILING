"""Per-user application preference persistence."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity
from app.models.user_preference import UserPreference
from app.user_preferences_schemas import UserPreferencesUpdate, UserPreferencesView

_SINGLE_USER_KEY = "__single__"


def actor_key(identity: RequestIdentity) -> str:
    return identity.user_id or _SINGLE_USER_KEY


async def get_user_preferences(
    session: AsyncSession,
    identity: RequestIdentity,
) -> UserPreferencesView:
    row = (
        await session.execute(
            select(UserPreference).where(
                UserPreference.org_id == identity.org.id,
                UserPreference.user_key == actor_key(identity),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return UserPreferencesView(locale="en", locale_configured=False)
    return UserPreferencesView(locale=row.locale, locale_configured=True)


async def update_user_preferences(
    session: AsyncSession,
    identity: RequestIdentity,
    payload: UserPreferencesUpdate,
) -> UserPreferencesView:
    key = actor_key(identity)
    row = (
        await session.execute(
            select(UserPreference).where(
                UserPreference.org_id == identity.org.id,
                UserPreference.user_key == key,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = UserPreference(
            org_id=identity.org.id,
            user_key=key,
            locale=payload.locale,
        )
        session.add(row)
    else:
        row.locale = payload.locale
    await session.commit()
    return UserPreferencesView(locale=payload.locale, locale_configured=True)
