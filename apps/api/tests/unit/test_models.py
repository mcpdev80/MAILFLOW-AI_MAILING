"""Smoke tests: all models import and register with Base.metadata."""


def test_all_tables_registered():
    from app.models import Base

    expected = {
        "organizations",
        "llm_providers",
        "email_accounts",
        "mailbox_access",
        "domain_rules",
        "keyword_rules",
        "internal_domains",
        "processed_emails",
        "audit_log",
        "stripe_events",
        "lifecycle_events",
        "thread_summaries",
        "decision_memory_entries",
        "backfill_jobs",
        "backfill_failures",
        "bulk_proposals",
        "bulk_apply_jobs",
    }
    assert expected == set(Base.metadata.tables.keys())


def test_email_account_has_llm_provider_relationship():
    from app.models.email_account import EmailAccount

    assert hasattr(EmailAccount, "llm_provider")


def test_keyword_rule_has_array_column():
    from app.models.rules import KeywordRule
    from sqlalchemy.dialects.postgresql import ARRAY

    col = KeywordRule.__table__.c["keywords"]
    assert isinstance(col.type, ARRAY)
