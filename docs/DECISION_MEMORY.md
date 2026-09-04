# DecisionMemory

DecisionMemory reuses compact, mailbox-scoped classification decisions without storing full email bodies.

## Trust model

Only `human_confirmed` and `human_corrected` entries may bypass the LLM, and only when the configured matcher confidence reaches `DECISION_MEMORY_REUSE_THRESHOLD`.

`ai_observed` entries are non-authoritative. They may be retained as hints but cannot directly bypass classification.

Weak matches above `DECISION_MEMORY_HINT_THRESHOLD` are passed into the normal adaptive classifier as prior context. Suspicious mail-authentication or spam signals suppress memory lookup entirely.

## Scope

Entries are scoped to one email account. A sender or domain match never crosses mailbox boundaries.

Matching prefers, in order, thread-specific decisions, sender + exact subject, sender + similar subject, domain + exact subject, then broader sender/domain hints. Broad matches decay with age.

## Stored data

DecisionMemory stores only compact matching and decision fields such as sender/domain, normalized subject pattern, optional thread identity, semantic classification, optional routing target, source/trust, usage counters, and timestamps. It does not store message bodies.

A stored `routing_target` is decision metadata only in this implementation. DecisionMemory does not execute that target directly. Mailbox actions continue through the normal routing/action path so the safe action policies introduced by issue #10 can remain the single enforcement boundary.

## Management

Users with mailbox content access may inspect entries. Changes that affect shared mailbox behavior require mailbox management permission. Entries can be replaced, disabled, or deleted.

New explicit entries created through the API are limited to human-confirmed or human-corrected sources. New conflicting trusted decisions disable the older trusted entry while retaining it for audit/history.

## Observability

Processed email rows record the matched DecisionMemory entry identifier, match confidence, and whether the memory was used only as a hint. The identifier remains historical provenance even if the learned entry is later deleted. Direct reuse is recorded with classification method `decision_memory`.
