from __future__ import annotations

from app.routers.bootstrap import build_bootstrap_status


def test_bootstrap_status_reports_cli_owned_values(monkeypatch) -> None:
    monkeypatch.setenv("MAILFLOW_DEPLOYMENT_SOURCE", "cli")
    monkeypatch.setenv("MAILFLOW_PUBLIC_URL", "https://mail.mcp-dev.de")
    monkeypatch.setenv("MAILFLOW_TLS_MODE", "custom")
    monkeypatch.setenv("MAILFLOW_BOOTSTRAP_LANGUAGE", "de")
    monkeypatch.setenv("TLS_CERT_FILE", "/tmp/fullchain.pem")
    monkeypatch.setenv("TLS_KEY_FILE", "/tmp/privkey.pem")

    status = build_bootstrap_status()

    assert status["deployment_source"] == "cli"
    fields = status["fields"]
    assert fields["public_url"] == {
        "value": "https://mail.mcp-dev.de",
        "configured": True,
        "source": "cli",
        "managed": True,
    }
    assert fields["tls"]["value"] == "custom"
    assert fields["tls"]["managed"] is True
    assert fields["language"] == {
        "value": "de",
        "configured": True,
        "source": "cli",
        "managed": False,
    }


def test_bootstrap_status_infers_legacy_custom_tls(monkeypatch) -> None:
    monkeypatch.delenv("MAILFLOW_TLS_MODE", raising=False)
    monkeypatch.setenv("TLS_CERT_FILE", "/tmp/fullchain.pem")
    monkeypatch.setenv("TLS_KEY_FILE", "/tmp/privkey.pem")

    status = build_bootstrap_status()

    assert status["fields"]["tls"]["value"] == "custom"


def test_bootstrap_status_rejects_unknown_language_and_source(monkeypatch) -> None:
    monkeypatch.setenv("MAILFLOW_DEPLOYMENT_SOURCE", "something-else")
    monkeypatch.setenv("MAILFLOW_BOOTSTRAP_LANGUAGE", "fr")

    status = build_bootstrap_status()

    assert status["deployment_source"] == "environment"
    assert status["fields"]["language"]["configured"] is False
