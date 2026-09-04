"""Thread matching and compact-summary persistence tests."""

from __future__ import annotations

from uuid import uuid4

from mailflow_core.types import ParsedEmail, ThreadSummaryUpdate

from app.models.email_account import EmailAccount
from app.models.organization import Organization
from app.models.processed_email import ProcessedEmail
from app.repositories.thread import ThreadRepository


def parsed(
    *,
    message_id: str,
    subject: str = "Project update",
    sender: str = "alice@example.com",
    recipients: list[str] | None = None,
    in_reply_to: str | None = None,
    references: tuple[str, ...] = (),
) -> ParsedEmail:
    return ParsedEmail(
        uid=1,
        subject_normalized=subject,
        body_text="Current message",
        body_html="",
        signature="",
        from_email=sender,
        from_domain=sender.split("@")[-1],
        to_emails=recipients or ["bob@example.com"],
        message_id=message_id,
        in_reply_to=in_reply_to,
        references=references,
    )


async def make_account(session) -> EmailAccount:
    org = Organization(name="Threads", slug=f"threads-{uuid4().hex[:8]}")
    session.add(org)
    await session.flush()
    account = EmailAccount(
        org_id=org.id,
        imap_host="imap.example.com",
        username=f"{uuid4().hex[:8]}@example.com",
    )
    session.add(account)
    await session.commit()
    return account


async def test_references_take_priority_over_in_reply_to(session):
    account = await make_account(session)
    repo = ThreadRepository(session)

    reference_thread = await repo.create_thread(
        account.id,
        parsed(message_id="<ref-root@test>"),
    )
    await repo.apply_message(
        reference_thread,
        parsed(message_id="<ref@test>"),
        ThreadSummaryUpdate("Reference thread", True, False),
    )

    reply_thread = await repo.create_thread(
        account.id,
        parsed(message_id="<reply-root@test>", subject="Other subject"),
    )
    await repo.apply_message(
        reply_thread,
        parsed(message_id="<reply@test>", subject="Other subject"),
        ThreadSummaryUpdate("Reply thread", True, False),
    )
    await session.commit()

    match = await repo.find_for_message(
        account.id,
        parsed(
            message_id="<current@test>",
            references=("<ref@test>",),
            in_reply_to="<reply@test>",
        ),
    )

    assert match is not None
    assert match.thread_id == reference_thread.thread_id


async def test_message_id_relationship_uses_processed_history(session):
    account = await make_account(session)
    repo = ThreadRepository(session)
    thread = await repo.create_thread(account.id, parsed(message_id="<root@test>"))
    await session.flush()

    from app.models.audit_log import AuditLog

    cycle_id = uuid4()
    session.add(AuditLog(account_id=account.id, cycle_id=cycle_id))
    session.add(
        ProcessedEmail(
            account_id=account.id,
            uid=10,
            folder="INBOX",
            uidvalidity=1,
            message_id="<historic@test>",
            thread_id=thread.thread_id,
            from_email="alice@example.com",
            subject="Project update",
            destination_folder="Archive",
            classification_label="work",
            category="work",
            importance="normal",
            urgency="none",
            action_required="no",
            confidence=0.9,
            method="llm",
            cycle_id=cycle_id,
        )
    )
    await session.commit()

    match = await repo.find_for_message(
        account.id,
        parsed(message_id="<new@test>", in_reply_to="<historic@test>"),
    )
    assert match is not None
    assert match.thread_id == thread.thread_id


async def test_subject_fallback_requires_one_strong_participant_match(session):
    account = await make_account(session)
    repo = ThreadRepository(session)
    thread = await repo.create_thread(account.id, parsed(message_id="<one@test>"))
    await repo.apply_message(
        thread,
        parsed(message_id="<one@test>"),
        ThreadSummaryUpdate("Project is active", True, True, "Friday"),
    )
    await session.commit()

    strong = await repo.find_for_message(
        account.id,
        parsed(message_id="<two@test>", references=(), in_reply_to=None),
    )
    assert strong is not None
    assert strong.thread_id == thread.thread_id

    weak = await repo.find_for_message(
        account.id,
        parsed(
            message_id="<three@test>",
            sender="charlie@example.com",
            recipients=["bob@example.com"],
        ),
    )
    assert weak is None


async def test_summary_changes_only_when_model_marks_message_relevant(session):
    account = await make_account(session)
    repo = ThreadRepository(session)
    thread = await repo.create_thread(account.id, parsed(message_id="<one@test>"))
    await repo.apply_message(
        thread,
        parsed(message_id="<one@test>"),
        ThreadSummaryUpdate("Original summary", True, True, "Friday"),
    )
    await repo.apply_message(
        thread,
        parsed(message_id="<two@test>"),
        ThreadSummaryUpdate("Should be ignored", False, False, None),
    )
    await session.commit()

    assert thread.summary == "Original summary"
    assert thread.message_count == 2
    assert thread.last_message_id == "<two@test>"
    assert thread.open_action_required is False
    assert thread.deadline is None
