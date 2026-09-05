"""Smart mailbox structure proposal, routing and apply tests."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from mailflow_core.types import ClassificationResult

from app.mailbox_structure import best_match, build_proposal, normalize_name
from app.routing import destination_for_classification
from app.services.mailbox_structure import MailboxStructureService
from app.structure_schemas import StructureApply


def _classification(
    category: str, subcategory: str | None = None
) -> ClassificationResult:
    return ClassificationResult(
        label="legacy-folder",
        confidence=0.95,
        method="llm",
        category=category,
        subcategory=subcategory,
        importance="normal",
        urgency="none",
        action_required="no",
    )


def test_normalize_name_is_case_accent_and_separator_insensitive() -> None:
    assert normalize_name("Acción requerida") == "accionrequerida"
    assert normalize_name("Diese-Woche") == "diesewoche"


def test_known_localized_equivalent_is_reused() -> None:
    match, confidence, kind = best_match(
        {"en": "Invoices", "de": "Rechnungen", "es": "Facturas"},
        ["INBOX", "Rechnungen"],
    )
    assert match == "Rechnungen"
    assert confidence == 0.98
    assert kind == "equivalent"


def test_uncertain_similar_name_requires_review() -> None:
    proposal = build_proposal(
        locale="en",
        existing_folders=["Invoice Docs"],
        existing_tags=[],
    )
    invoices = next(
        item for item in proposal["folders"] if item["internal_id"] == "invoices"
    )
    assert invoices["suggested_action"] in {"review", "create"}
    assert invoices["suggested_action"] != "reuse"


def test_german_proposal_reuses_existing_names_and_localizes_missing() -> None:
    proposal = build_proposal(
        locale="de",
        existing_folders=["INBOX", "Rechnungen", "Archiv"],
        existing_tags=["Dringend"],
        current_config={"folders": {"work": "Meine Arbeit"}},
    )
    invoices = next(
        item for item in proposal["folders"] if item["internal_id"] == "invoices"
    )
    urgent = next(item for item in proposal["tags"] if item["internal_id"] == "urgent")
    orders = next(
        item for item in proposal["folders"] if item["internal_id"] == "orders"
    )
    assert invoices["existing_match"] == "Rechnungen"
    assert invoices["suggested_action"] == "reuse"
    assert urgent["existing_match"] == "Dringend"
    assert urgent["suggested_action"] == "reuse"
    assert orders["proposed_name"] == "Bestellungen"
    assert proposal["current_config"]["folders"]["work"] == "Meine Arbeit"


def test_unknown_locale_falls_back_to_english() -> None:
    proposal = build_proposal(locale="fr", existing_folders=[], existing_tags=[])
    work = next(item for item in proposal["folders"] if item["internal_id"] == "work")
    assert proposal["locale"] == "en"
    assert work["proposed_name"] == "Work"


def test_routing_prefers_exact_subcategory_then_category_mapping() -> None:
    account = SimpleNamespace(
        structure_config={
            "folders": {"finance": "Finanzen", "invoices": "Rechnungen"},
            "routes": [
                {"category": "finance", "subcategory": None, "folder_id": "finance"},
                {
                    "category": "finance",
                    "subcategory": "invoices",
                    "folder_id": "invoices",
                },
            ],
        },
        unclassified_folder="Unclassified",
    )
    assert (
        destination_for_classification(account, _classification("finance", "invoices"))
        == "Rechnungen"
    )
    assert (
        destination_for_classification(account, _classification("finance", "tax"))
        == "Finanzen"
    )


def test_routing_keeps_legacy_fallback_before_setup() -> None:
    account = SimpleNamespace(structure_config={}, unclassified_folder="Unclassified")
    assert (
        destination_for_classification(account, _classification("work"))
        == "legacy-folder"
    )


def test_apply_schema_rejects_route_to_unknown_folder() -> None:
    with pytest.raises(ValueError, match="unknown folder_id"):
        StructureApply.model_validate(
            {
                "locale": "de",
                "folders": [],
                "tags": [],
                "routes": [{"category": "finance", "folder_id": "invoices"}],
            }
        )


class _FakeClient:
    def __init__(self) -> None:
        self.folders = ["INBOX", "Rechnungen"]

    def list_folders(self):
        return [((), "/", name) for name in self.folders]

    def select_folder(self, folder):
        return {b"PERMANENTFLAGS": (b"\\Seen", b"Dringend", b"MailTag")}


class _FakeProvider:
    def __init__(self) -> None:
        self._client = _FakeClient()
        self.created: list[str] = []
        self.connected = False

    def connect(self) -> None:
        self.connected = True

    def disconnect(self) -> None:
        self.connected = False

    def ensure_folder_exists(self, name: str) -> None:
        if name not in self._client.folders:
            self._client.folders.append(name)
            self.created.append(name)


class _Session:
    async def commit(self) -> None:
        return None


class _SessionContext:
    async def __aenter__(self):
        return _Session()

    async def __aexit__(self, exc_type, exc, tb):
        return False


def _session_factory():
    return _SessionContext()


async def test_discovery_does_not_create_mailbox_objects(monkeypatch) -> None:
    account = SimpleNamespace(
        id=uuid4(),
        inbox_folder="INBOX",
        structure_config={},
    )
    provider = _FakeProvider()
    service = MailboxStructureService(_session_factory)

    async def fake_account(account_id):
        return account

    async def fake_provider(current):
        return provider

    monkeypatch.setattr(service, "_account", fake_account)
    monkeypatch.setattr(service, "_provider", fake_provider)
    result = await service.discover(account.id, locale="de")

    assert provider.created == []
    invoices = next(
        item for item in result.proposal["folders"] if item["internal_id"] == "invoices"
    )
    assert invoices["existing_match"] == "Rechnungen"


async def test_apply_creates_only_approved_missing_folders_and_persists_mapping(
    monkeypatch,
) -> None:
    account = SimpleNamespace(
        id=uuid4(),
        org_id=uuid4(),
        inbox_folder="INBOX",
        structure_config={},
    )
    provider = _FakeProvider()
    service = MailboxStructureService(_session_factory)

    async def fake_account(account_id):
        return account

    async def fake_provider(current):
        return provider

    class _AccountRepo:
        def __init__(self, session) -> None:
            pass

        async def get_full_config(self, account_id):
            return account, None, None

    async def fake_audit(*args, **kwargs):
        return None

    monkeypatch.setattr(service, "_account", fake_account)
    monkeypatch.setattr(service, "_provider", fake_provider)
    monkeypatch.setattr(
        "app.services.mailbox_structure.AccountRepository", _AccountRepo
    )
    monkeypatch.setattr(
        "app.services.mailbox_structure.record_lifecycle_event", fake_audit
    )

    payload = StructureApply.model_validate(
        {
            "locale": "de",
            "folders": [
                {
                    "internal_id": "invoices",
                    "mailbox_name": "Rechnungen",
                    "action": "reuse",
                },
                {
                    "internal_id": "orders",
                    "mailbox_name": "Bestellungen",
                    "action": "create",
                },
            ],
            "tags": [
                {
                    "internal_id": "urgent",
                    "mailbox_name": "Dringend",
                    "action": "reuse",
                },
                {
                    "internal_id": "follow_up",
                    "mailbox_name": "Nachfassen",
                    "action": "create",
                },
            ],
            "routes": [
                {
                    "category": "finance",
                    "subcategory": "invoices",
                    "folder_id": "invoices",
                },
                {"category": "orders", "folder_id": "orders"},
            ],
        }
    )
    result = await service.apply(account.id, payload, actor_user_id="user-1")

    assert provider.created == ["Bestellungen"]
    assert result["reused_folders"] == ["Rechnungen"]
    assert account.structure_config["folders"] == {
        "invoices": "Rechnungen",
        "orders": "Bestellungen",
    }
    assert account.structure_config["tags"]["urgent"] == "Dringend"
    assert account.structure_config["tags"]["follow_up"] == "Nachfassen"


async def test_apply_refuses_reuse_of_missing_object(monkeypatch) -> None:
    account = SimpleNamespace(id=uuid4(), inbox_folder="INBOX", structure_config={})
    provider = _FakeProvider()
    service = MailboxStructureService(_session_factory)

    async def fake_account(account_id):
        return account

    async def fake_provider(current):
        return provider

    monkeypatch.setattr(service, "_account", fake_account)
    monkeypatch.setattr(service, "_provider", fake_provider)

    payload = StructureApply.model_validate(
        {
            "locale": "en",
            "folders": [
                {
                    "internal_id": "work",
                    "mailbox_name": "Does Not Exist",
                    "action": "reuse",
                }
            ],
            "tags": [],
            "routes": [{"category": "work", "folder_id": "work"}],
        }
    )
    with pytest.raises(ValueError, match="folder_to_reuse_not_found"):
        await service.apply(account.id, payload, actor_user_id="user-1")
    assert provider.created == []
