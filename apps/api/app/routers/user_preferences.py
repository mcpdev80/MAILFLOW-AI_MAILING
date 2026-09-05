"""User-level application preferences."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity, require_identity
from app.database import get_session
from app.services.user_preferences import get_user_preferences, update_user_preferences
from app.user_preferences_schemas import UserPreferencesUpdate, UserPreferencesView

router = APIRouter(prefix="/user/preferences", tags=["user-preferences"])


@router.get("", response_model=UserPreferencesView)
async def read_user_preferences(
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> UserPreferencesView:
    return await get_user_preferences(session, identity)


@router.put("", response_model=UserPreferencesView)
async def replace_user_preferences(
    payload: UserPreferencesUpdate,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> UserPreferencesView:
    return await update_user_preferences(session, identity, payload)
