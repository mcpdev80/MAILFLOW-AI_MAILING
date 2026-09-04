# Mailbox action policy

MailFlow evaluates mailbox side effects after semantic classification. Classification and action execution remain separate decisions.

## Defaults

Per mailbox:

- classification: automatic
- tags: classification metadata is produced automatically
- move: `automatic`
- archive: `off`
- delete: never automatic
- send: never automatic; generated replies remain drafts until a user explicitly sends them
- minimum confidence for automatic actions: `0.85`

Move and archive support three modes:

- `off`: do not execute the action
- `review`: never execute automatically; record the action as requiring review
- `automatic`: execute only when all safety checks pass

## Automatic-action safety checks

Automatic move/archive is blocked from execution and sent to review when any of these conditions applies:

- confidence is below the mailbox action threshold
- `review_required` is true
- `needs_more_context` is true
- importance, urgency, or action-required is `unknown`
- `suspicious_content` is true
- the classification remains `unclassified`

Mail authentication and spam signals already feed classification safety state, so suspicious transport signals cannot bypass this policy through DecisionMemory reuse.

## Processing behavior

The processing cycle marks a source message as processed before executing a permitted move. This keeps UID-based handling idempotent because a successful move invalidates the source UID.

When move policy is `off` or `review`, or when automatic safety checks fail, the message remains in the inbox and is marked processed. The processed-email record stores the action disposition and reason so the later review workflow can surface it without re-running classification.

A provider move failure is treated as an operational failure and is not silently recorded as a successful action.

## Persisted action state

Each processed email records:

- requested mailbox action
- action disposition (`execute`, `review`, `blocked`, or `none`)
- action decision reason
- whether action review is required
- logical destination folder

This is intentionally lightweight. The dedicated audit-trail work can build richer event history without changing the policy boundary.

## Administration

Mailbox managers can change move/archive modes and the automatic-action confidence threshold through the account API and mailbox detail screen. Authorization remains enforced by the backend.
