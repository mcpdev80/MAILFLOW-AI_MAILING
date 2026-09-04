"""Normalize mail authentication and spam headers into compact internal signals."""

from __future__ import annotations

import re
from email.message import Message

from mailflow_core.types import MailAuthSignals

_AUTH_VALUE = re.compile(r"\b(spf|dkim|dmarc|arc)\s*=\s*([a-zA-Z0-9_-]+)", re.IGNORECASE)
_SCORE_VALUE = re.compile(r"\bscore\s*=\s*(-?\d+(?:\.\d+)?)", re.IGNORECASE)
_SCL_VALUE = re.compile(r"\bSCL[:=]\s*(-?\d+(?:\.\d+)?)", re.IGNORECASE)


def _normalize_spf(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    if normalized in {"pass", "fail", "softfail", "neutral", "none"}:
        return normalized
    return "unknown"


def _normalize_auth(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    if normalized in {"pass", "fail", "none"}:
        return normalized
    return "unknown"


def _normalize_dmarc(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    if normalized in {"pass", "fail", "bestguesspass", "none"}:
        return normalized
    return "unknown"


def _safe_float(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _authentication_results(msg: Message) -> dict[str, str]:
    values: dict[str, str] = {}
    for header in msg.get_all("Authentication-Results", []):
        for key, value in _AUTH_VALUE.findall(header):
            values.setdefault(key.lower(), value.lower())
    if "spf" not in values:
        received_spf = msg.get("Received-SPF")
        if received_spf:
            values["spf"] = received_spf.split(None, 1)[0].strip().lower()
    return values


def _spam_signals(msg: Message) -> tuple[str, float | None]:
    verdict = "unknown"
    score: float | None = None

    spam_status = msg.get("X-Spam-Status")
    if spam_status:
        lowered = spam_status.strip().lower()
        if lowered.startswith("yes"):
            verdict = "spam"
        elif lowered.startswith("no"):
            verdict = "clean"
        match = _SCORE_VALUE.search(spam_status)
        if match:
            score = _safe_float(match.group(1))

    spam_flag = msg.get("X-Spam-Flag") or msg.get("X-Spam")
    if spam_flag:
        lowered = spam_flag.strip().lower()
        if lowered in {"yes", "true", "spam"}:
            verdict = "spam"
        elif lowered in {"no", "false", "ham", "clean"} and verdict == "unknown":
            verdict = "clean"

    spam_score = msg.get("X-Spam-Score")
    if score is None and spam_score:
        score = _safe_float(spam_score.strip())

    scl = msg.get("X-MS-Exchange-Organization-SCL")
    if score is None and scl:
        score = _safe_float(scl.strip())
    if scl:
        scl_value = _safe_float(scl.strip())
        if scl_value is not None:
            if scl_value >= 5:
                verdict = "spam"
            elif scl_value >= 1 and verdict == "unknown":
                verdict = "suspicious"
            elif scl_value <= 0 and verdict == "unknown":
                verdict = "clean"

    forefront = msg.get("X-Forefront-Antispam-Report")
    if forefront:
        lowered = forefront.lower()
        if "sfv:spm" in lowered:
            verdict = "spam"
        elif "sfv:skn" in lowered or "sfv:nspm" in lowered:
            if verdict == "unknown":
                verdict = "clean"
        match = _SCL_VALUE.search(forefront)
        if score is None and match:
            score = _safe_float(match.group(1))

    gmail_spam = msg.get("X-Gm-Spam")
    if gmail_spam:
        lowered = gmail_spam.strip().lower()
        if lowered in {"1", "yes", "true"}:
            verdict = "spam"
        elif lowered in {"0", "no", "false"} and verdict == "unknown":
            verdict = "clean"

    return verdict, score


def normalize_mail_auth_signals(msg: Message) -> MailAuthSignals:
    """Return normalized auth/spam metadata without retaining raw provider headers."""
    auth = _authentication_results(msg)
    spam_verdict, spam_score = _spam_signals(msg)
    return MailAuthSignals(
        spf=_normalize_spf(auth.get("spf")),  # type: ignore[arg-type]
        dkim=_normalize_auth(auth.get("dkim")),  # type: ignore[arg-type]
        dmarc=_normalize_dmarc(auth.get("dmarc")),  # type: ignore[arg-type]
        arc=_normalize_auth(auth.get("arc")),  # type: ignore[arg-type]
        spam_verdict=spam_verdict,  # type: ignore[arg-type]
        spam_score=spam_score,
    )


def auth_signals_require_review(signals: MailAuthSignals) -> bool:
    """Return whether normalized signals justify conservative human review."""
    if signals.spam_verdict in {"spam", "suspicious"}:
        return True
    failures = sum(
        value == "fail" for value in (signals.spf, signals.dkim, signals.dmarc, signals.arc)
    )
    return signals.dmarc == "fail" or failures >= 2


def auth_signals_mark_suspicious(signals: MailAuthSignals) -> bool:
    """Only strong spam metadata marks content suspicious by itself."""
    return signals.spam_verdict == "spam"


def auth_signals_block_memory_reuse(signals: MailAuthSignals) -> bool:
    """Suppress direct learned reuse when current transport signals materially conflict."""
    return auth_signals_require_review(signals)
