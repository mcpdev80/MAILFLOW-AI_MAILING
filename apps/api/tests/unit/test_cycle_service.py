"""CycleService unit tests with mocked external systems."""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

from mailflow_core.classification.rule_engine import AccountConfig
from mailflow_core.providers.base import EmailData
from mailflow_core.types import ClassificationResult, ThreadSummaryUpdate

ACCOUNT_ID = UUID("00000000-0000-0000-0000-000000000001")


def make_sf(session=None):
    if session is None:
        session = AsyncMock()

    @asynccontextmanager
    async def sf():
        yield session

    return sf


def make_email(uid: int = 42, in_reply_to: str | None = None) -> EmailData:
    return EmailData(
        uid=uid,
        message_id=f"<msg-{uid}@test>",
        subject="Test subject",
        from_email="sender@external.com",
        to_emails=["worker@company.com"],
        body_text="Hello, need help.",
        body_html="",
        in_reply_to=in_reply_to,
    )


def make_account():
    acc = MagicMock()
    acc.id = ACCOUNT_ID
    acc.imap_host = "localhost"
    acc.imap_port = 1143
    acc.use_ssl = False
    acc.username = "test"
    acc.provider_type = "imap"
    acc.encrypted_oauth = None
    acc.encrypted_credentials = "tok"
    acc.inbox_folder = "INBOX"
    acc.unclassified_folder = "Sin_Clasificar"
    acc.drafts_folder = "Drafts"
    acc.llm_provider = None
    acc.move_policy = "automatic"
    acc.archive_policy = "off"
    acc.action_confidence_threshold = 0.85
    return acc


def safe_classification(confidence: float = 0.95) -> ClassificationResult:
    return ClassificationResult(
        label="work",
        category="work",
        importance="normal",
        urgency="none",
        action_required="no",
        confidence=confidence,
        method="llm",
    )


def configure_thread_repo(MockThreadRepo, *, summary: str = "", existing: bool = False):
    thread = MagicMock()
    thread.thread_id = "thread-1"
    thread.summary = summary
    MockThreadRepo.return_value.find_for_message = AsyncMock(
        return_value=thread if existing else None
    )
    MockThreadRepo.return_value.create_thread = AsyncMock(return_value=thread)
    MockThreadRepo.return_value.get_thread = AsyncMock(return_value=thread)
    MockThreadRepo.return_value.apply_message = AsyncMock()
    return thread


def configure_memory_repo(MockDecisionMemoryRepo):
    MockDecisionMemoryRepo.return_value.candidates_for_email = AsyncMock(
        return_value=()
    )
    MockDecisionMemoryRepo.return_value.mark_used = AsyncMock()


@patch("app.services.cycle.AccountRepository")
@patch("app.services.cycle.CycleRepository")
async def test_run_aborts_when_claim_cycle_fails(MockCycleRepo, MockAccountRepo):
    MockAccountRepo.return_value.claim_cycle = AsyncMock(return_value=False)

    from app.services.cycle import CycleService

    result = await CycleService(make_sf()).run(ACCOUNT_ID)

    assert result.emails_processed == 0
    assert result.errors == 0
    MockAccountRepo.return_value.claim_cycle.assert_awaited_once()
    MockCycleRepo.return_value.create_audit_log.assert_not_called()


@patch("app.services.cycle.AccountRepository")
@patch("app.services.cycle.CycleRepository")
@patch("app.services.cycle.ImapGenericProvider")
@patch("app.services.cycle.decrypt_secret", return_value={"password": "pw"})
@patch("app.services.cycle._build_llm_client", return_value=None)
async def test_run_imap_connect_failure(
    mock_build, mock_decrypt, MockProvider, MockCycleRepo, MockAccountRepo
):
    from app.services.cycle import CycleService
    from mailflow_core.exceptions import IMAPConnectionError

    MockAccountRepo.return_value.claim_cycle = AsyncMock(return_value=True)
    MockAccountRepo.return_value.get_full_config = AsyncMock(
        return_value=(make_account(), AccountConfig(account_id=str(ACCOUNT_ID)), None)
    )
    MockCycleRepo.return_value.create_audit_log = AsyncMock()
    MockCycleRepo.return_value.finalize_audit_log = AsyncMock()
    MockProvider.return_value.connect.side_effect = IMAPConnectionError("timeout")

    result = await CycleService(make_sf()).run(ACCOUNT_ID)

    assert result.emails_processed == 0
    assert result.errors == 1
    MockCycleRepo.return_value.finalize_audit_log.assert_awaited_once()


@patch("app.services.cycle.DecisionMemoryRepository")
@patch("app.services.cycle.ThreadRepository")
@patch("app.services.cycle.AccountRepository")
@patch("app.services.cycle.CycleRepository")
@patch("app.services.cycle.ImapGenericProvider")
@patch("app.services.cycle.decrypt_secret", return_value={"password": "pw"})
@patch("app.services.cycle._build_llm_client")
async def test_run_mark_before_safe_move(
    mock_build,
    mock_decrypt,
    MockProvider,
    MockCycleRepo,
    MockAccountRepo,
    MockThreadRepo,
    MockDecisionMemoryRepo,
):
    from app.services.cycle import CycleService

    configure_thread_repo(MockThreadRepo)
    configure_memory_repo(MockDecisionMemoryRepo)
    MockAccountRepo.return_value.claim_cycle = AsyncMock(return_value=True)
    MockAccountRepo.return_value.get_full_config = AsyncMock(
        return_value=(
            make_account(),
            AccountConfig(account_id=str(ACCOUNT_ID)),
            MagicMock(),
        )
    )
    MockCycleRepo.return_value.create_audit_log = AsyncMock()
    MockCycleRepo.return_value.finalize_audit_log = AsyncMock()
    MockProvider.return_value.fetch_unprocessed_emails.return_value = [
        make_email(uid=42)
    ]
    MockCycleRepo.return_value.insert_processed = AsyncMock()

    classify_client = MagicMock()
    classify_client.classify.return_value = safe_classification()
    classify_client.update_thread_summary.return_value = ThreadSummaryUpdate(
        summary="No open action.",
        changed=True,
        open_action_required=False,
    )
    mock_build.side_effect = [classify_client, None]

    call_order: list[str] = []
    MockProvider.return_value.mark_as_processed.side_effect = lambda uid: (
        call_order.append(f"mark:{uid}")
    )

    def move(uid: int, destination: str) -> bool:
        call_order.append(f"move:{uid}")
        return True

    MockProvider.return_value.move_email.side_effect = move

    result = await CycleService(make_sf()).run(ACCOUNT_ID)

    assert result.emails_processed == 1
    assert call_order == ["mark:42", "move:42"]
    inserted = MockCycleRepo.return_value.insert_processed.call_args.kwargs
    assert inserted["thread_id"] == "thread-1"
    assert inserted["action_decision"].disposition == "execute"


@patch("app.services.cycle.DecisionMemoryRepository")
@patch("app.services.cycle.ThreadRepository")
@patch("app.services.cycle.AccountRepository")
@patch("app.services.cycle.CycleRepository")
@patch("app.services.cycle.ImapGenericProvider")
@patch("app.services.cycle.decrypt_secret", return_value={"password": "pw"})
@patch("app.services.cycle._build_llm_client")
async def test_review_action_stays_in_inbox_without_move(
    mock_build,
    mock_decrypt,
    MockProvider,
    MockCycleRepo,
    MockAccountRepo,
    MockThreadRepo,
    MockDecisionMemoryRepo,
):
    from app.services.cycle import CycleService

    configure_thread_repo(MockThreadRepo)
    configure_memory_repo(MockDecisionMemoryRepo)
    account = make_account()
    account.move_policy = "review"
    MockAccountRepo.return_value.claim_cycle = AsyncMock(return_value=True)
    MockAccountRepo.return_value.get_full_config = AsyncMock(
        return_value=(account, AccountConfig(account_id=str(ACCOUNT_ID)), MagicMock())
    )
    MockCycleRepo.return_value.create_audit_log = AsyncMock()
    MockCycleRepo.return_value.finalize_audit_log = AsyncMock()
    MockProvider.return_value.fetch_unprocessed_emails.return_value = [
        make_email(uid=43)
    ]
    MockCycleRepo.return_value.insert_processed = AsyncMock()

    classify_client = MagicMock()
    classify_client.classify.return_value = safe_classification()
    classify_client.update_thread_summary.return_value = ThreadSummaryUpdate(
        summary="No open action.",
        changed=True,
        open_action_required=False,
    )
    mock_build.side_effect = [classify_client, None]

    result = await CycleService(make_sf()).run(ACCOUNT_ID)

    assert result.emails_processed == 1
    MockProvider.return_value.mark_as_processed.assert_called_once_with(43)
    MockProvider.return_value.move_email.assert_not_called()
    inserted = MockCycleRepo.return_value.insert_processed.call_args.kwargs
    assert inserted["destination_folder"] == "INBOX"
    assert inserted["action_decision"].disposition == "review"
    assert inserted["action_decision"].requires_review is True


@patch("app.services.cycle.DecisionMemoryRepository")
@patch("app.services.cycle.ThreadRepository")
@patch("app.services.cycle.AccountRepository")
@patch("app.services.cycle.CycleRepository")
@patch("app.services.cycle.ImapGenericProvider")
@patch("app.services.cycle.decrypt_secret", return_value={"password": "pw"})
@patch("app.services.cycle._build_llm_client")
async def test_existing_thread_summary_is_context_not_inherited_classification(
    mock_build,
    mock_decrypt,
    MockProvider,
    MockCycleRepo,
    MockAccountRepo,
    MockThreadRepo,
    MockDecisionMemoryRepo,
):
    from app.services.cycle import CycleService

    configure_thread_repo(
        MockThreadRepo,
        summary="Invoice was open and the customer needed to pay.",
        existing=True,
    )
    configure_memory_repo(MockDecisionMemoryRepo)
    account = make_account()
    MockAccountRepo.return_value.claim_cycle = AsyncMock(return_value=True)
    MockAccountRepo.return_value.get_full_config = AsyncMock(
        return_value=(account, AccountConfig(account_id=str(ACCOUNT_ID)), MagicMock())
    )
    MockCycleRepo.return_value.create_audit_log = AsyncMock()
    MockCycleRepo.return_value.finalize_audit_log = AsyncMock()
    MockProvider.return_value.fetch_unprocessed_emails.return_value = [
        make_email(uid=99, in_reply_to="<original@test>")
    ]
    MockProvider.return_value.move_email.return_value = True
    MockCycleRepo.return_value.insert_processed = AsyncMock()

    classify_client = MagicMock()
    classify_client.classify.return_value = ClassificationResult(
        label="finance",
        category="finance",
        importance="normal",
        urgency="none",
        action_required="no",
        confidence=0.91,
        method="llm",
    )
    classify_client.update_thread_summary.return_value = ThreadSummaryUpdate(
        summary="Invoice is now paid; no open action remains.",
        changed=True,
        open_action_required=False,
    )
    mock_build.side_effect = [classify_client, None]

    await CycleService(make_sf()).run(ACCOUNT_ID)

    classification = MockCycleRepo.return_value.insert_processed.call_args.kwargs[
        "classification"
    ]
    assert classification.method == "llm"
    assert classification.action_required == "no"
    assert classify_client.classify.call_args.kwargs["thread_summary"] == (
        "Invoice was open and the customer needed to pay."
    )
    classify_client.update_thread_summary.assert_called_once()


@patch("app.services.cycle.DecisionMemoryRepository")
@patch("app.services.cycle.ThreadRepository")
@patch("app.services.cycle.AccountRepository")
@patch("app.services.cycle.CycleRepository")
@patch("app.services.cycle.ImapGenericProvider")
@patch("app.services.cycle.decrypt_secret", return_value={"password": "pw"})
@patch("app.services.cycle._build_llm_client")
async def test_run_draft_bytes_passed_to_save_draft(
    mock_build,
    mock_decrypt,
    MockProvider,
    MockCycleRepo,
    MockAccountRepo,
    MockThreadRepo,
    MockDecisionMemoryRepo,
):
    from app.services.cycle import CycleService
    from mailflow_core.classification.rule_engine import DomainRule as CoreDomainRule

    configure_thread_repo(MockThreadRepo)
    configure_memory_repo(MockDecisionMemoryRepo)
    account = make_account()
    config = AccountConfig(
        account_id=str(ACCOUNT_ID),
        client_domain_rules=[
            CoreDomainRule(domain="external.com", label="Clients/Ext", rule_id="r1")
        ],
    )

    MockAccountRepo.return_value.claim_cycle = AsyncMock(return_value=True)
    MockAccountRepo.return_value.get_full_config = AsyncMock(
        return_value=(account, config, None)
    )
    MockCycleRepo.return_value.create_audit_log = AsyncMock()
    MockCycleRepo.return_value.finalize_audit_log = AsyncMock()
    MockProvider.return_value.fetch_unprocessed_emails.return_value = [
        make_email(uid=55)
    ]
    MockCycleRepo.return_value.insert_processed = AsyncMock()

    mock_generate_client = MagicMock()
    mock_generate_client.generate_draft.return_value = (
        "Estimado cliente, gracias por su consulta."
    )
    mock_build.side_effect = [None, mock_generate_client]

    saved_bytes: list = []
    MockProvider.return_value.save_draft.side_effect = lambda b: (
        saved_bytes.append(b) or True
    )

    await CycleService(make_sf()).run(ACCOUNT_ID)

    assert len(saved_bytes) == 1
    assert isinstance(saved_bytes[0], bytes)
    import email as email_module

    msg = email_module.message_from_bytes(saved_bytes[0])
    assert "Re:" in msg["Subject"]


@patch("app.services.cycle.DecisionMemoryRepository")
@patch("app.services.cycle.ThreadRepository")
@patch("app.services.cycle.AccountRepository")
@patch("app.services.cycle.CycleRepository")
@patch("app.services.cycle.ImapGenericProvider")
@patch("app.services.cycle.decrypt_secret", return_value={"password": "pw"})
@patch("app.services.cycle._build_llm_client")
async def test_model_outage_keeps_message_pending(
    mock_build,
    mock_decrypt,
    MockProvider,
    MockCycleRepo,
    MockAccountRepo,
    MockThreadRepo,
    MockDecisionMemoryRepo,
):
    from app.services.cycle import CycleService
    from mailflow_core.exceptions import LLMError

    configure_thread_repo(MockThreadRepo)
    configure_memory_repo(MockDecisionMemoryRepo)
    MockAccountRepo.return_value.claim_cycle = AsyncMock(return_value=True)
    MockAccountRepo.return_value.get_full_config = AsyncMock(
        return_value=(
            make_account(),
            AccountConfig(account_id=str(ACCOUNT_ID)),
            MagicMock(),
        )
    )
    MockCycleRepo.return_value.create_audit_log = AsyncMock()
    MockCycleRepo.return_value.finalize_audit_log = AsyncMock()
    MockProvider.return_value.fetch_unprocessed_emails.return_value = [make_email(uid=77)]
    MockCycleRepo.return_value.insert_processed = AsyncMock()

    classify_client = MagicMock()
    classify_client.classify.side_effect = LLMError("all classification paths unavailable")
    mock_build.side_effect = [classify_client, None]

    result = await CycleService(make_sf()).run(ACCOUNT_ID)

    assert result.emails_processed == 0
    assert result.errors == 1
    MockProvider.return_value.mark_as_processed.assert_not_called()
    MockProvider.return_value.move_email.assert_not_called()
    MockCycleRepo.return_value.insert_processed.assert_not_awaited()
