"""CycleRepository — cycle log and processed email persistence."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from mailflow_core.action_policy import ActionDecision
from mailflow_core.types import ClassificationResult, MailAuthSignals
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_policy import message_audit_decision
from app.lifecycle import record_lifecycle_event
from app.models.audit_log import AuditLog
from app.models.email_account import EmailAccount
from app.models.processed_email import ProcessedEmail


class CycleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_audit_log(self, account_id: UUID, cycle_id: UUID) -> AuditLog:
        log = AuditLog(account_id=account_id, cycle_id=cycle_id)
        self._session.add(log)
        await self._session.flush()
        return log

    async def finalize_audit_log(
        self,
        cycle_id: UUID,
        emails: int,
        drafts: int,
        errors: int,
        error_detail: str | None,
        duration_ms: int,
    ) -> None:
        await self._session.execute(
            update(AuditLog)
            .where(AuditLog.cycle_id == cycle_id)
            .values(
                emails_processed=emails,
                drafts_saved=drafts,
                error_count=errors,
                error_detail=error_detail,
                duration_ms=duration_ms,
                finalized_at=datetime.now(tz=UTC),
            )
        )

    async def insert_processed(
        self,
        account_id: UUID,
        uid: int,
        folder: str,
        uidvalidity: int,
        message_id: str | None,
        thread_id: str | None,
        from_email: str,
        subject: str,
        destination_folder: str,
        classification: ClassificationResult,
        action_decision: ActionDecision,
        auth_signals: MailAuthSignals,
        draft_saved: bool,
        cycle_id: UUID,
    ) -> bool:
        """Persist final message state and audit only meaningful mailbox mutations."""
        memory_id = (
            UUID(classification.decision_memory_id)
            if classification.decision_memory_id is not None
            else None
        )
        stmt = (
            pg_insert(ProcessedEmail)
            .values(
                account_id=account_id,
                uid=uid,
                folder=folder,
                uidvalidity=uidvalidity,
                message_id=message_id,
                thread_id=thread_id,
                from_email=from_email,
                subject=subject,
                destination_folder=destination_folder,
                mailbox_action=action_decision.action,
                mailbox_action_status=action_decision.disposition,
                mailbox_action_reason=action_decision.reason,
                action_review_required=action_decision.requires_review,
                classification_label=classification.label,
                category=classification.category,
                subcategory=classification.subcategory,
                suggested_category=classification.suggested_category,
                suggested_subcategory=classification.suggested_subcategory,
                importance=classification.importance,
                urgency=classification.urgency,
                action_required=classification.action_required,
                system_tags=list(classification.system_tags),
                user_tags=list(classification.user_tags),
                confidence=classification.confidence,
                needs_more_context=classification.needs_more_context,
                review_required=classification.review_required,
                suspicious_content=classification.suspicious_content,
                reason=classification.reason,
                classification_stage=classification.classification_stage,
                classification_model=classification.classification_model,
                decision_memory_id=memory_id,
                decision_memory_match_confidence=(
                    classification.decision_memory_match_confidence
                ),
                decision_memory_hint_used=classification.decision_memory_hint_used,
                auth_spf=auth_signals.spf,
                auth_dkim=auth_signals.dkim,
                auth_dmarc=auth_signals.dmarc,
                auth_arc=auth_signals.arc,
                spam_verdict=auth_signals.spam_verdict,
                spam_score=auth_signals.spam_score,
                method=classification.method,
                draft_saved=draft_saved,
                cycle_id=cycle_id,
            )
            .on_conflict_do_nothing(index_elements=["account_id", "uid", "uidvalidity"])
            .returning(ProcessedEmail.id)
        )
        inserted_id = (await self._session.execute(stmt)).scalar_one_or_none()
        if inserted_id is None:
            return False

        audit = message_audit_decision(
            folder=folder,
            destination_folder=destination_folder,
            classification=classification,
            action_decision=action_decision,
        )
        if audit is None:
            return True

        org_id = await self._session.scalar(
            select(EmailAccount.org_id).where(EmailAccount.id == account_id)
        )
        if org_id is None:
            raise RuntimeError("processed_email_account_missing")
        await record_lifecycle_event(
            self._session,
            org_id=org_id,
            account_id=account_id,
            event=audit.event,
            status=audit.status,
            message_ref=f"{uidvalidity}:{uid}",
            details=audit.details,
        )
        return True
