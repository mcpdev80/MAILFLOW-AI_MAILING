"""Compatibility wrappers around the centralized secret manager."""

from __future__ import annotations

import json
from typing import Any

from cryptography.fernet import Fernet

from app.config import settings
from app.secrets import SecretManager


def configured_secret_keys() -> list[str]:
    """Return primary plus fallback encryption keys in rotation order."""
    configured = [
        key.strip() for key in settings.SECRET_ENCRYPTION_KEYS.split(",") if key.strip()
    ]
    if settings.SECRET_KEY and settings.SECRET_KEY not in configured:
        configured.append(settings.SECRET_KEY)
    return configured


def secret_manager() -> SecretManager:
    return SecretManager(configured_secret_keys())


def encrypt_secret(data: dict[str, Any]) -> str:
    """Encrypt a structured secret with the current primary deployment key."""
    return secret_manager().encrypt(data)


def decrypt_secret(token: str) -> dict[str, Any]:
    """Decrypt a structured secret using primary or rotation fallback keys."""
    return secret_manager().decrypt(token)


def rotate_secret(token: str) -> str:
    """Re-encrypt one stored token using the current primary key."""
    return secret_manager().rotate(token)


# Legacy helpers remain for existing callers/tests that explicitly supply one key.
def encrypt(data: dict, key: str) -> str:
    return Fernet(key.encode()).encrypt(json.dumps(data).encode()).decode()


def decrypt(token: str, key: str) -> dict:
    return json.loads(Fernet(key.encode()).decrypt(token.encode()))
