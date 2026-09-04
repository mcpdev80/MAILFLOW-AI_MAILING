"""CLI for validating restored MailFlow state before workers resume."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from app.database import async_session_factory
from app.restore_validation import RestoreValidationError, validate_restore_state
from app.secrets import SecretConfigurationError

APP_VERSION = "0.1.0"


async def _run() -> int:
    try:
        async with async_session_factory() as session:
            result = await validate_restore_state(session)
    except (RestoreValidationError, SecretConfigurationError) as exc:
        print(f"RESTORE VALIDATION: FAIL: {exc}")
        return 1

    print("RESTORE VALIDATION: PASS")
    print(f"application_version={APP_VERSION}")
    print(f"schema_revision={result.schema_revision}")
    print(f"validated_at={datetime.now(tz=UTC).isoformat()}")
    print(f"encrypted_secrets={result.encrypted_secrets}")
    print(f"private_mailboxes={result.private_mailboxes}")
    print(f"shared_mailboxes={result.shared_mailboxes}")
    print(f"passkeys={result.passkeys}")
    return 0


def main() -> None:
    raise SystemExit(asyncio.run(_run()))


if __name__ == "__main__":
    main()
