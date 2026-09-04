"""Rotate encrypted database secrets to the current primary deployment key.

Run from the API environment with both new and old keys configured, for example:

    SECRET_ENCRYPTION_KEYS="NEW_KEY,OLD_KEY" python -m app.secret_rotation

After a successful run and restart validation, the old fallback key can be removed.
"""

from __future__ import annotations

import asyncio
import logging

from app.database import async_session_factory
from app.secret_storage import rotate_stored_secrets

log = logging.getLogger("mailflow.secret_rotation")


async def rotate() -> int:
    async with async_session_factory() as session:
        result = await rotate_stored_secrets(session)
    print(
        "Secret rotation complete: "
        f"mailbox_credentials={result.mailbox_credentials} "
        f"oauth_tokens={result.oauth_tokens} "
        f"llm_api_keys={result.llm_api_keys} "
        f"total={result.total}"
    )
    return result.total


if __name__ == "__main__":
    asyncio.run(rotate())
