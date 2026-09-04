"""Compatibility wrappers around the centralized secret manager."""

from __future__ import annotations

import json
from typing import Any

from cryptography.fernet import Fernet

from app.config import settings
from app.secrets import SecretManager


def configured_secret_keys() -> list[str]:
    """Return encryption keys in rotation order.

    An explicit SECRET_ENCRYPTION_KEYS value fully owns DB encryption. When it
    is empty, the historical SECRET_KEY remains the single legacy encryption key.
    This lets operators rotate DB encryption independently from signing secrets.
    """
    configured = [
        key.strip() for key in settings.SECRET_ENCRYPTION_KEYS.split(",") if key.strip()
    ]
    return configured or [settings.SECRET_KEY]


def secret_manager() -> SecretManager:
    return SecretManager(configured_secret_keys())


def encrypt_secret(data: dict[str, Any]) -> str:
    return secret_manager().encrypt(data)


def decrypt_secret(token: str) -> dict[str, Any]:
    return secret_manager().decrypt(token)


def rotate_secret(token: str) -> str:
    return secret_manager().rotate(token)


# Legacy helpers remain for existing callers/tests that explicitly supply one key.
def encrypt(data: dict, key: str) -> str:
    return Fernet(key.encode()).encrypt(json.dumps(data).encode()).decode()


def decrypt(token: str, key: str) -> dict:
    return json.loads(Fernet(key.encode()).decrypt(token.encode()))
