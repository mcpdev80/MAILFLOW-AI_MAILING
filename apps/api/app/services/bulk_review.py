"""Cluster dry-run proposals into a small number of human review decisions."""

from __future__ import annotations

import hashlib
from collections import defaultdict
from dataclasses import dataclass
from email.utils import parseaddr
from uuid import UUID

from app.models.bulk import BulkProposal
from app.repositories.bulk import BulkRepository


@dataclass(frozen=True)
class ClusterKey:
    category: str
    destination: str
    action: str

    @property
    def id(self) -> str:
        raw = "\0".join((self.category, self.destination, self.action))
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]


@dataclass(frozen=True)
class ChildKey:
    parent: ClusterKey
    sender_domain: str

    @property
    def id(self) -> str:
        raw = "\0".join(
            (
                self.parent.category,
                self.parent.destination,
                self.parent.action,
                self.sender_domain,
            )
        )
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]


def _domain(value: object) -> str:
    address = parseaddr(str(value or ""))[1].strip().lower()
    if "@" not in address:
        return "unknown"
    return address.rsplit("@", 1)[1] or "unknown"


def _cluster_key(snapshot: dict) -> ClusterKey:
    return ClusterKey(
        category=str(snapshot.get("category") or "other"),
        destination=str(snapshot.get("proposed_folder") or snapshot.get("source_folder") or ""),
        action=("move" if bool(snapshot.get("do_move")) else "keep"),
    )


def proposal_cluster_id(proposal: BulkProposal) -> str:
    return _cluster_key(BulkRepository.effective_snapshot(proposal)).id


def proposal_child_cluster_id(proposal: BulkProposal) -> str:
    snapshot = BulkRepository.effective_snapshot(proposal)
    return ChildKey(_cluster_key(snapshot), _domain(snapshot.get("from_email"))).id


def _aggregate(proposals: list[BulkProposal], *, key: ClusterKey, sender_domain: str | None = None) -> dict:
    confidences: list[float] = []
    review = 0
    suspicious = 0
    statuses: dict[str, int] = defaultdict(int)
    samples: list[dict[str, object]] = []
    for proposal in proposals:
        snapshot = BulkRepository.effective_snapshot(proposal)
        try:
            confidences.append(float(snapshot.get("confidence") or 0.0))
        except (TypeError, ValueError):
            confidences.append(0.0)
        review += int(bool(snapshot.get("review_required")))
        suspicious += int(bool(snapshot.get("suspicious_content")))
        statuses[proposal.status] += 1
        if len(samples) < 3:
            samples.append(
                {
                    "proposal_id": str(proposal.id),
                    "from_email": str(snapshot.get("from_email") or ""),
                    "subject": str(snapshot.get("subject") or ""),
                    "confidence": float(snapshot.get("confidence") or 0.0),
                    "reason": snapshot.get("reason"),
                }
            )
    count = len(proposals)
    avg = sum(confidences) / count if count else 0.0
    return {
        "category": key.category,
        "destination": key.destination,
        "action": key.action,
        "sender_domain": sender_domain,
        "count": count,
        "review_required": review,
        "suspicious": suspicious,
        "safe": max(0, count - review - suspicious),
        "confidence_avg": avg,
        "confidence_min": min(confidences, default=0.0),
        "confidence_max": max(confidences, default=0.0),
        "statuses": dict(statuses),
        "samples": samples,
    }


def build_review_summary(proposals: list[BulkProposal]) -> dict:
    parents: dict[ClusterKey, list[BulkProposal]] = defaultdict(list)
    status_counts: dict[str, int] = defaultdict(int)
    review = 0
    suspicious = 0

    for proposal in proposals:
        snapshot = BulkRepository.effective_snapshot(proposal)
        parents[_cluster_key(snapshot)].append(proposal)
        status_counts[proposal.status] += 1
        review += int(bool(snapshot.get("review_required")))
        suspicious += int(bool(snapshot.get("suspicious_content")))

    clusters: list[dict] = []
    for key, rows in parents.items():
        parent = _aggregate(rows, key=key)
        parent["id"] = key.id

        children_by_domain: dict[str, list[BulkProposal]] = defaultdict(list)
        for proposal in rows:
            snapshot = BulkRepository.effective_snapshot(proposal)
            children_by_domain[_domain(snapshot.get("from_email"))].append(proposal)

        children = []
        for domain, child_rows in children_by_domain.items():
            child = _aggregate(child_rows, key=key, sender_domain=domain)
            child["id"] = ChildKey(key, domain).id
            children.append(child)
        children.sort(key=lambda item: (-int(item["count"]), str(item["sender_domain"])))
        parent["children"] = children[:50]
        clusters.append(parent)

    clusters.sort(
        key=lambda item: (
            -int(item["review_required"]),
            -int(item["count"]),
            str(item["category"]),
            str(item["destination"]),
        )
    )
    total = len(proposals)
    return {
        "total": total,
        "review_required": review,
        "suspicious": suspicious,
        "safe": max(0, total - review - suspicious),
        "status_counts": dict(status_counts),
        "decision_count": len(clusters),
        "clusters": clusters,
    }


def select_cluster_proposals(
    proposals: list[BulkProposal],
    cluster_id: str,
) -> list[BulkProposal]:
    return [
        proposal
        for proposal in proposals
        if proposal_cluster_id(proposal) == cluster_id
        or proposal_child_cluster_id(proposal) == cluster_id
    ]


def proposal_ids(proposals: list[BulkProposal]) -> list[UUID]:
    return [proposal.id for proposal in proposals]
