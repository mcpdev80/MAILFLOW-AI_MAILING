"""Read-only historical classification used by dry-run/review workflows."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, replace

from mailflow_core.action_policy import evaluate_mailbox_action
from mailflow_core.classification.adaptive import (
    AdaptiveClassificationConfig,
    AdaptiveClassifier,
)
from mailflow_core.classification.llm_client import LLMClient
from mailflow_core.classification.rule_engine import RuleEngine
from mailflow_core.decision_memory import PrefetchedDecisionMemoryLookup
from mailflow_core.email_parser import EmailParser
from mailflow_core.providers.base import EmailData
from mailflow_core.providers.imap_generic import ImapGenericProvider
from mailflow_core.types import ClassificationResult, ParsedEmail

from app.config import settings
from app.models.email_account import EmailAccount
from app.repositories.decision_memory import DecisionMemoryRepository
from app.repositories.thread import ThreadRepository
from app.routing import destination_for_classification
from app.services.cycle import _build_action_policy, _build_memory_config


@dataclass(frozen=True)
class BulkPreview:
    snapshot: dict[str, object]
    classification: ClassificationResult


def _snapshot(
    *,
    email_data: EmailData,
    parsed: ParsedEmail,
    result: ClassificationResult,
    source_folder: str,
    proposed_folder: str,
    action_disposition: str,
    action_reason: str,
    do_move: bool,
) -> dict[str, object]:
    """Build the compact immutable proposal input; never include message bodies."""
    return {
        "message_id": email_data.message_id or None,
        "from_email": parsed.from_email[:500],
        "subject": parsed.subject_normalized[:1000],
        "date": parsed.date,
        "source_folder": source_folder,
        "category": result.category,
        "subcategory": result.subcategory,
        "suggested_category": result.suggested_category,
        "suggested_subcategory": result.suggested_subcategory,
        "importance": result.importance,
        "urgency": result.urgency,
        "action_required": result.action_required,
        "system_tags": list(result.system_tags),
        "user_tags": list(result.user_tags),
        "confidence": result.confidence,
        "review_required": result.requires_review(
            settings.CLASSIFICATION_CONFIDENCE_THRESHOLD
        ),
        "suspicious_content": result.suspicious_content,
        "reason": result.reason[:500] if result.reason else None,
        "classification_stage": result.classification_stage,
        "classification_model": result.classification_model,
        "classification_source": result.method,
        "decision_memory_id": result.decision_memory_id,
        "decision_memory_match_confidence": result.decision_memory_match_confidence,
        "proposed_folder": proposed_folder,
        "proposed_action": "move",
        "action_disposition": action_disposition,
        "action_reason": action_reason,
        "do_move": do_move,
    }


async def classify_preview(
    *,
    account: EmailAccount,
    source_folder: str,
    email_data: EmailData,
    provider: ImapGenericProvider,
    parser: EmailParser,
    rule_engine: RuleEngine,
    classify_client: LLMClient | None,
    session_factory,
) -> BulkPreview:
    """Classify one message without mutating provider or MailFlow message/thread state."""
    headers_only = parser.parse(email_data)
    previous_summary: str | None = None
    thread_id: str | None = None
    async with session_factory() as session:
        thread = await ThreadRepository(session).find_for_message(
            account.id, headers_only
        )
        if thread is not None:
            thread_id = thread.thread_id
            previous_summary = thread.summary or None
            headers_only = replace(headers_only, thread_id=thread_id)
        memory_candidates = await DecisionMemoryRepository(
            session
        ).candidates_for_email(account.id, headers_only)

    def load_body(max_chars: int | None) -> ParsedEmail:
        body_text, body_html = provider.fetch_body(email_data.uid, max_chars)
        parsed_body = parser.parse(
            replace(email_data, body_text=body_text, body_html=body_html)
        )
        return replace(parsed_body, thread_id=thread_id)

    supporting_signal = rule_engine.supporting_signal(headers_only)
    parsed = headers_only
    if classify_client is not None:
        memory_lookup = (
            PrefetchedDecisionMemoryLookup(
                memory_candidates,
                config=_build_memory_config(),
            )
            if memory_candidates
            else None
        )
        adaptive = AdaptiveClassifier(
            classify_client,
            config=AdaptiveClassificationConfig(
                confidence_threshold=settings.CLASSIFICATION_CONFIDENCE_THRESHOLD
            ),
            decision_memory=memory_lookup,
        )
        outcome = await asyncio.to_thread(
            adaptive.classify,
            headers_only,
            thread_summary=previous_summary,
            body_loader=load_body,
            supporting_signal=supporting_signal,
        )
        result = outcome.result
        parsed = outcome.email
    else:
        result = supporting_signal or ClassificationResult(
            label="unclassified",
            confidence=0.0,
            method="fallback",
        )

    action_decision = evaluate_mailbox_action(
        _build_action_policy(account),
        "move",
        result,
    )
    proposed_folder = destination_for_classification(account, result)
    return BulkPreview(
        classification=result,
        snapshot=_snapshot(
            email_data=email_data,
            parsed=parsed,
            result=result,
            source_folder=source_folder,
            proposed_folder=proposed_folder,
            action_disposition=action_decision.disposition,
            action_reason=action_decision.reason,
            do_move=action_decision.execute,
        ),
    )
