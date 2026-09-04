"""Deterministic classification cascade for incoming emails."""

from __future__ import annotations

from dataclasses import dataclass, field

from mailflow_core.types import CONFIRMED_CATEGORIES, ClassificationResult, ParsedEmail

GENERIC_DOMAINS: frozenset[str] = frozenset(
    {
        "gmail.com",
        "hotmail.com",
        "outlook.com",
        "yahoo.com",
        "yahoo.es",
        "icloud.com",
        "me.com",
        "protonmail.com",
        "proton.me",
        "live.com",
    }
)


@dataclass(frozen=True)
class DomainRule:
    domain: str
    label: str
    rule_id: str


@dataclass(frozen=True)
class KeywordRule:
    keywords: tuple[str, ...]
    label: str
    rule_id: str
    match_all: bool = False


@dataclass
class AccountConfig:
    account_id: str
    internal_domains: list[str] = field(default_factory=list)
    client_domain_rules: list[DomainRule] = field(default_factory=list)
    keyword_rules: list[KeywordRule] = field(default_factory=list)


class RuleEngine:
    """Six-step classification cascade: domain → thread → keyword → LLM → fallback."""

    def __init__(self, config: AccountConfig, llm_client: object | None = None) -> None:
        self._config = config
        self._llm = llm_client

    def classify(
        self,
        email: ParsedEmail,
        thread_history: list[ClassificationResult] | None = None,
        available_labels: list[str] | None = None,
    ) -> ClassificationResult:
        labels = available_labels or [r.label for r in self._config.client_domain_rules] + [
            "unclassified"
        ]

        if email.from_domain in self._config.internal_domains:
            return _legacy_result("internal", 1.0, "domain_internal")

        if email.from_domain not in GENERIC_DOMAINS:
            for rule in self._config.client_domain_rules:
                if rule.domain == email.from_domain:
                    return _legacy_result(
                        rule.label,
                        0.95,
                        "domain_client",
                        rule_id=rule.rule_id,
                    )

        if thread_history:
            last = thread_history[-1]
            if last.confidence >= 0.80:
                return ClassificationResult(
                    label=last.label,
                    confidence=0.90,
                    method="thread",
                    category=last.category,
                    subcategory=last.subcategory,
                    suggested_category=last.suggested_category,
                    suggested_subcategory=last.suggested_subcategory,
                    importance=last.importance,
                    urgency=last.urgency,
                    action_required=last.action_required,
                    system_tags=last.system_tags,
                    user_tags=last.user_tags,
                    needs_more_context=last.needs_more_context,
                    review_required=last.review_required,
                    reason=last.reason,
                )

        search_text = f"{email.subject_normalized} {email.body_text}".lower()
        for rule in self._config.keyword_rules:
            kws = [k.lower() for k in rule.keywords]
            matched = (
                all(k in search_text for k in kws)
                if rule.match_all
                else any(k in search_text for k in kws)
            )
            if matched:
                return _legacy_result(
                    rule.label,
                    0.80,
                    "keyword",
                    rule_id=rule.rule_id,
                )

        if self._llm is not None:
            try:
                result = self._llm.classify(
                    email,
                    available_labels=labels,
                    available_categories=list(CONFIRMED_CATEGORIES),
                )
                if result.confidence >= 0.60:
                    return result
            except Exception:
                pass

        return _legacy_result("unclassified", 0.0, "fallback")


def _legacy_result(
    label: str,
    confidence: float,
    method: str,
    *,
    rule_id: str | None = None,
) -> ClassificationResult:
    category = label if label in CONFIRMED_CATEGORIES else "other"
    return ClassificationResult(
        label=label,
        confidence=confidence,
        method=method,  # type: ignore[arg-type]
        rule_id=rule_id,
        category=category,  # type: ignore[arg-type]
    )
