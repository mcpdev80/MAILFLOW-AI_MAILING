"""Tests for normalized mail authentication and spam metadata."""

from email import message_from_string

from mailflow_core.mail_auth import (
    auth_signals_block_memory_reuse,
    auth_signals_mark_suspicious,
    auth_signals_require_review,
    normalize_mail_auth_signals,
)


def _signals(headers: str):
    return normalize_mail_auth_signals(message_from_string(headers + "\n\nbody"))


def test_authentication_results_passes_are_normalized() -> None:
    signals = _signals(
        "Authentication-Results: mx.example; spf=pass smtp.mailfrom=example.com; "
        "dkim=pass header.d=example.com; dmarc=pass; arc=pass"
    )
    assert signals.spf == "pass"
    assert signals.dkim == "pass"
    assert signals.dmarc == "pass"
    assert signals.arc == "pass"
    assert signals.spam_verdict == "unknown"
    assert not auth_signals_require_review(signals)


def test_received_spf_is_used_when_authentication_results_lacks_spf() -> None:
    signals = _signals("Received-SPF: softfail client-ip=203.0.113.10")
    assert signals.spf == "softfail"


def test_missing_headers_are_safe_unknowns() -> None:
    signals = _signals("Subject: hello")
    assert signals.compact() == (
        "spf=unknown dkim=unknown dmarc=unknown arc=unknown spam=unknown"
    )
    assert not auth_signals_require_review(signals)


def test_spamassassin_status_and_score_are_normalized() -> None:
    signals = _signals("X-Spam-Status: Yes, score=8.4 required=5.0 tests=HTML_MESSAGE")
    assert signals.spam_verdict == "spam"
    assert signals.spam_score == 8.4
    assert auth_signals_require_review(signals)
    assert auth_signals_mark_suspicious(signals)
    assert auth_signals_block_memory_reuse(signals)


def test_microsoft_scl_is_normalized_without_vendor_fields_leaking() -> None:
    signals = _signals("X-MS-Exchange-Organization-SCL: 3")
    assert signals.spam_verdict == "suspicious"
    assert signals.spam_score == 3.0
    assert auth_signals_require_review(signals)


def test_forefront_spam_verdict_is_normalized() -> None:
    signals = _signals("X-Forefront-Antispam-Report: CIP:203.0.113.5;SCL:6;SFV:SPM;")
    assert signals.spam_verdict == "spam"
    assert signals.spam_score == 6.0


def test_forwarding_style_single_spf_failure_is_not_absolute_spam() -> None:
    signals = _signals(
        "Authentication-Results: mx.example; spf=fail smtp.mailfrom=forwarder.example; "
        "dkim=pass header.d=sender.example; dmarc=pass"
    )
    assert signals.spf == "fail"
    assert signals.dkim == "pass"
    assert signals.dmarc == "pass"
    assert signals.spam_verdict == "unknown"
    assert not auth_signals_require_review(signals)
    assert not auth_signals_mark_suspicious(signals)


def test_dmarc_failure_requires_review_but_not_spam_flag() -> None:
    signals = _signals(
        "Authentication-Results: mx.example; spf=fail; dkim=fail; dmarc=fail"
    )
    assert auth_signals_require_review(signals)
    assert auth_signals_block_memory_reuse(signals)
    assert not auth_signals_mark_suspicious(signals)
