"""Tests for legacy crypto wrappers and the centralized secret manager."""

import pytest
from cryptography.fernet import Fernet, InvalidToken


def test_encrypt_decrypt_roundtrip():
    from app.crypto import decrypt, encrypt

    key = Fernet.generate_key().decode()
    data = {"password": "secret123", "extra": 42}

    token = encrypt(data, key)
    assert isinstance(token, str)
    assert token != str(data)
    assert decrypt(token, key) == data


def test_decrypt_wrong_key_raises():
    from app.crypto import decrypt, encrypt

    key1 = Fernet.generate_key().decode()
    key2 = Fernet.generate_key().decode()
    token = encrypt({"x": 1}, key1)

    with pytest.raises(InvalidToken):
        decrypt(token, key2)


def test_encrypt_returns_different_tokens_each_call():
    from app.crypto import encrypt

    key = Fernet.generate_key().decode()
    data = {"password": "pw"}
    assert encrypt(data, key) != encrypt(data, key)


def test_decrypt_corrupted_token_raises():
    from app.crypto import decrypt

    key = Fernet.generate_key().decode()
    with pytest.raises(InvalidToken):
        decrypt("this-is-not-a-fernet-token", key)


def test_secret_manager_uses_fallback_key_and_rotates_to_primary():
    from app.secrets import SecretManager

    old_key = Fernet.generate_key().decode()
    new_key = Fernet.generate_key().decode()
    old_manager = SecretManager([old_key])
    keyring = SecretManager([new_key, old_key])

    old_token = old_manager.encrypt({"refresh_token": "rt-secret"})
    assert keyring.decrypt(old_token) == {"refresh_token": "rt-secret"}

    rotated = keyring.rotate(old_token)
    assert SecretManager([new_key]).decrypt(rotated) == {"refresh_token": "rt-secret"}


def test_secret_manager_wrong_key_has_safe_error():
    from app.secrets import SecretConfigurationError, SecretManager

    key1 = Fernet.generate_key().decode()
    key2 = Fernet.generate_key().decode()
    token = SecretManager([key1]).encrypt({"password": "do-not-leak"})

    with pytest.raises(SecretConfigurationError) as exc:
        SecretManager([key2]).decrypt(token)
    assert "do-not-leak" not in str(exc.value)


def test_secret_manager_rejects_invalid_key():
    from app.secrets import SecretConfigurationError, SecretManager

    with pytest.raises(SecretConfigurationError):
        SecretManager(["not-a-fernet-key"])
