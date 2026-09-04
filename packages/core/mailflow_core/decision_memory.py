"""Conservative matching for trusted classification decisions.

DecisionMemory stores compact matching keys and semantic decisions only. It never
stores message bodies and never treats AI-only observations as authoritative reuse.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Literal

from mailflow_core.types import ClassificationResult, ParsedEmail

MemorySource = Literal["human_confirmed", "human_corrected", "ai_observed"]

_SUBJECT_TOKEN = re.compile(r"[a-z0-9]+", re.IGNORECASE)


@dataclass(frozen=True)
class DecisionMemoryCandidate:
    """Persistence-independent memory entry used by the core matcher."""

    entry_id: str
    account_id: str
    sender_email: str | None
    sender_domain: str | None
    subject_pattern: str | None
    thread_id: str | None
    result: ClassificationResult
    source: MemorySource
    trust_score: float
    enabled: bool = True
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        if not 0.0 <= self.trust_score <= 1.0:
            raise ValueError("trust_score must be between 0.0 and 1.0")


@dataclass(frozen=True)
class DecisionMemoryMatch:
    """One ranked memory match and whether it is safe for direct reuse."""

    candidate: DecisionMemoryCandidate
    match_confidence: float
    can_bypass: bool
    reason: str

    @property
    def result(self) -> ClassificationResult:
        return self.candidate.result


@dataclass(frozen=True)
class DecisionMemoryConfig:
    direct_reuse_threshold: float = 0.93
    hint_threshold: float = 0.68
    broad_pattern_decay_days: int = 180

    def __post_init__(self) -> None:
        if not 0.0 <= self.hint_threshold <= self.direct_reuse_threshold <= 1.0:
            raise ValueError("memory thresholds must be ordered within 0.0-1.0")
        if self.broad_pattern_decay_days <= 0:
            raise ValueError("broad_pattern_decay_days must be positive")


class DecisionMemoryMatcher:
    """Rank account-scoped candidates, preferring false negatives to false positives."""

    def __init__(self, config: DecisionMemoryConfig | None = None) -> None:
        self._config = config or DecisionMemoryConfig()

    def match(
        self,
        email: ParsedEmail,
        candidates: tuple[DecisionMemoryCandidate, ...],
    ) -> DecisionMemoryMatch | None:
        best: DecisionMemoryMatch | None = None
        for candidate in candidates:
            if not candidate.enabled:
                continue
            scored = self._score(email, candidate)
            if scored is None or scored.match_confidence < self._config.hint_threshold:
                continue
            if best is None or scored.match_confidence > best.match_confidence:
                best = scored
            elif (
                best is not None
                and scored.match_confidence == best.match_confidence
                and _source_rank(scored.candidate.source) > _source_rank(best.candidate.source)
            ):
                best = scored
        return best

    def _score(
        self,
        email: ParsedEmail,
        candidate: DecisionMemoryCandidate,
    ) -> DecisionMemoryMatch | None:
        sender = email.from_email.strip().lower()
        domain = email.from_domain.strip().lower()
        candidate_sender = (candidate.sender_email or "").strip().lower()
        candidate_domain = (candidate.sender_domain or "").strip().lower()
        subject = normalize_subject_pattern(email.subject_normalized)
        pattern = normalize_subject_pattern(candidate.subject_pattern or "")

        sender_exact = bool(candidate_sender and candidate_sender == sender)
        domain_exact = bool(candidate_domain and candidate_domain == domain)
        thread_exact = bool(
            candidate.thread_id
            and email.thread_id
            and candidate.thread_id.strip() == email.thread_id.strip()
        )
        subject_exact = bool(pattern and pattern == subject)
        subject_similarity = _token_similarity(subject, pattern) if pattern else 0.0

        score = 0.0
        reason = ""
        if thread_exact and sender_exact:
            score, reason = 1.0, "thread_and_sender"
        elif sender_exact and subject_exact:
            score, reason = 0.97, "sender_and_subject"
        elif sender_exact and subject_similarity >= 0.80:
            score, reason = 0.91, "sender_and_similar_subject"
        elif domain_exact and subject_exact:
            score, reason = 0.89, "domain_and_subject"
        elif domain_exact and subject_similarity >= 0.85:
            score, reason = 0.82, "domain_and_similar_subject"
        elif sender_exact:
            score, reason = 0.72, "sender_only"
        elif domain_exact and subject_similarity >= 0.65:
            score, reason = 0.69, "domain_and_weak_subject"
        else:
            return None

        score *= candidate.trust_score
        if reason in {"sender_only", "domain_and_weak_subject", "domain_and_similar_subject"}:
            score *= self._decay_factor(candidate.updated_at)
        score = min(max(score, 0.0), 1.0)

        trusted = candidate.source in {"human_confirmed", "human_corrected"}
        can_bypass = trusted and score >= self._config.direct_reuse_threshold
        return DecisionMemoryMatch(
            candidate=candidate,
            match_confidence=score,
            can_bypass=can_bypass,
            reason=reason,
        )

    def _decay_factor(self, updated_at: datetime | None) -> float:
        if updated_at is None:
            return 0.85
        value = updated_at if updated_at.tzinfo else updated_at.replace(tzinfo=UTC)
        age_days = max((datetime.now(tz=UTC) - value).days, 0)
        if age_days <= self._config.broad_pattern_decay_days:
            return 1.0
        periods = age_days / self._config.broad_pattern_decay_days
        return max(0.50, 1.0 - 0.15 * periods)


def result_for_direct_reuse(match: DecisionMemoryMatch) -> ClassificationResult:
    """Mark a trusted reused decision with observable memory metadata."""
    return replace(
        match.result,
        method="decision_memory",
        classification_stage=None,
        classification_model=None,
        decision_memory_id=match.candidate.entry_id,
        decision_memory_match_confidence=match.match_confidence,
        decision_memory_hint_used=False,
        reason=(match.result.reason or f"DecisionMemory: {match.reason}"),
    )


def normalize_subject_pattern(value: str) -> str:
    """Normalize a subject into a compact, non-sensitive matching pattern."""
    return " ".join(_SUBJECT_TOKEN.findall(value.lower()))[:500]


def _token_similarity(left: str, right: str) -> float:
    left_tokens = set(_SUBJECT_TOKEN.findall(left.lower()))
    right_tokens = set(_SUBJECT_TOKEN.findall(right.lower()))
    if not left_tokens or not right_tokens:
        return 0.0
    intersection = len(left_tokens & right_tokens)
    union = len(left_tokens | right_tokens)
    return intersection / union if union else 0.0


def _source_rank(source: MemorySource) -> int:
    return {
        "ai_observed": 0,
        "human_confirmed": 1,
        "human_corrected": 2,
    }[source]
