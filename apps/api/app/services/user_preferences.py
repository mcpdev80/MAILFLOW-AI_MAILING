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


async def _find_preference(
    session: AsyncSession, identity: RequestIdentity
) -> UserPreference | None:
    result = await session.execute(
        select(UserPreference).where(
            UserPreference.org_id == identity.org.id,
            UserPreference.user_key == actor_key(identity),
        )
    )
    return result.scalar_one_or_none()


def _view(row: UserPreference | None) -> UserPreferencesView:
    if row is None:
        return UserPreferencesView(locale="en", locale_configured=False)
    return UserPreferencesView(
        locale=row.locale,
        locale_configured=True,
        theme=row.theme,
        density=row.density,
        workspace_layout=row.workspace_layout,
    )


async def get_user_preferences(
    session: AsyncSession,
    identity: RequestIdentity,
) -> UserPreferencesView:
    return _view(await _find_preference(session, identity))


def _apply(row: UserPreference, payload: UserPreferencesUpdate) -> None:
    values = payload.model_dump(exclude_none=True)
    for key, value in values.items():
        setattr(row, key, value)


async def update_user_preferences(
    session: AsyncSession,
    identity: RequestIdentity,
    payload: UserPreferencesUpdate,
) -> UserPreferencesView:
    row = await _find_preference(session, identity)
    if row is None:
        row = UserPreference(org_id=identity.org.id, user_key=actor_key(identity))
        session.add(row)
    _apply(row, payload)
    await session.commit()
    return _view(row)
