"""Centralized secret encryption, rotation, and redaction helpers.

Database secrets use Fernet authenticated encryption. The first configured key
is always used for new ciphertext; remaining keys are decrypt-only fallbacks so
operators can rotate keys without reconnecting mailboxes or providers.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

REDACTED = "[REDACTED]"
_SECRET_KEYS = {
    "password",
    "passwd",
    "secret",
    "api_key",
    "apikey",
    "access_token",
    "refresh_token",
    "authorization",
    "cookie",
    "set-cookie",
    "client_secret",
}

_BEARER_RE = re.compile(r"(?i)\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+")
_QUERY_SECRET_RE = re.compile(
    r"(?i)([?&](?:access_token|refresh_token|api_key|key|token|password|secret)=)[^&\s]+"
)
_JSON_SECRET_RE = re.compile(
    r'(?i)("(?:password|secret|api_key|access_token|refresh_token|client_secret)"\s*:\s*")[^"]*(")'
)


class SecretConfigurationError(RuntimeError):
    """Raised when stored ciphertext cannot be decrypted by configured keys."""


class SecretManager:
    """Encrypt and decrypt structured application secrets with a key ring."""

    def __init__(self, keys: Sequence[str]) -> None:
        cleaned = [key.strip() for key in keys if key and key.strip()]
        if not cleaned:
            raise SecretConfigurationError("no secret encryption key configured")
        try:
            self._fernets = [Fernet(key.encode()) for key in cleaned]
        except (TypeError, ValueError) as exc:
            raise SecretConfigurationError("invalid Fernet secret encryption key") from exc
        self._primary = self._fernets[0]
        self._multi = MultiFernet(self._fernets)

    @property
    def key_count(self) -> int:
        return len(self._fernets)

    def encrypt(self, data: Mapping[str, Any]) -> str:
        payload = json.dumps(dict(data), separators=(",", ":")).encode()
        return self._primary.encrypt(payload).decode()

    def decrypt(self, token: str) -> dict[str, Any]:
        try:
            payload = self._multi.decrypt(token.encode())
        except InvalidToken as exc:
            raise SecretConfigurationError(
                "stored secret cannot be decrypted with configured encryption keys"
            ) from exc
        value = json.loads(payload)
        if not isinstance(value, dict):
            raise SecretConfigurationError("stored secret payload is not an object")
        return value

    def rotate(self, token: str) -> str:
        """Re-encrypt one token with the primary key after validating old ciphertext."""
        return self.encrypt(self.decrypt(token))


def redact_text(value: str) -> str:
    """Remove common credentials from log/error text without hiding useful context."""
    value = _BEARER_RE.sub(lambda match: f"{match.group(1)} {REDACTED}", value)
    value = _QUERY_SECRET_RE.sub(lambda match: f"{match.group(1)}{REDACTED}", value)
    return _JSON_SECRET_RE.sub(lambda match: f"{match.group(1)}{REDACTED}{match.group(2)}", value)


def redact_value(value: Any, *, key: str | None = None) -> Any:
    """Recursively redact structured data intended for logs or diagnostics."""
    if key and key.lower().replace("-", "_") in _SECRET_KEYS:
        return REDACTED
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, Mapping):
        return {str(k): redact_value(v, key=str(k)) for k, v in value.items()}
    if isinstance(value, tuple):
        return tuple(redact_value(item) for item in value)
    if isinstance(value, list):
        return [redact_value(item) for item in value]
    return value
