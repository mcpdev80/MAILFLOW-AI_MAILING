from types import SimpleNamespace
from uuid import uuid4

from app.services.bulk_review import build_review_summary, select_cluster_proposals


def proposal(*, sender: str, category: str, destination: str, review: bool = False, suspicious: bool = False):
    return SimpleNamespace(
        id=uuid4(),
        status="proposed",
        edited_snapshot=None,
        original_snapshot={
            "from_email": sender,
            "subject": f"mail from {sender}",
            "category": category,
            "proposed_folder": destination,
            "do_move": True,
            "confidence": 0.9 if not review else 0.6,
            "review_required": review,
            "suspicious_content": suspicious,
            "reason": "test",
        },
    )


def test_review_summary_compresses_messages_into_parent_and_sender_groups():
    rows = [
        proposal(sender="a@amazon.de", category="orders", destination="Orders"),
        proposal(sender="b@amazon.de", category="orders", destination="Orders"),
        proposal(sender="news@example.org", category="newsletter", destination="Newsletter", review=True),
    ]

    summary = build_review_summary(rows)

    assert summary["total"] == 3
    assert summary["safe"] == 2
    assert summary["review_required"] == 1
    assert summary["decision_count"] == 2
    orders = next(item for item in summary["clusters"] if item["category"] == "orders")
    assert orders["count"] == 2
    assert orders["children"][0]["sender_domain"] == "amazon.de"
    assert orders["children"][0]["count"] == 2


def test_suspicious_review_is_not_counted_as_safe_twice():
    row = proposal(
        sender="bad@example.org",
        category="other",
        destination="INBOX",
        review=True,
        suspicious=True,
    )

    summary = build_review_summary([row])

    assert summary["safe"] == 0
    assert summary["review_required"] == 1
    assert summary["suspicious"] == 1


def test_child_cluster_selects_only_matching_sender_domain():
    first = proposal(sender="a@one.example", category="orders", destination="Orders")
    second = proposal(sender="b@two.example", category="orders", destination="Orders")
    summary = build_review_summary([first, second])
    parent = summary["clusters"][0]
    child = next(item for item in parent["children"] if item["sender_domain"] == "one.example")

    selected = select_cluster_proposals([first, second], child["id"])

    assert [item.id for item in selected] == [first.id]
