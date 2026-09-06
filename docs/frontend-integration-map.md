# Frontend integration map

This document is the implementation contract for the Figma redesign. The UI must render real backend state only. Example content in Figma is presentation-only and must never be shipped as application data.

## General rules

- Every data-driven surface must have loading, empty and error states.
- Mailbox content is always authorization-scoped by the backend.
- Shared mailboxes are visible only through explicit grants.
- UI actions must use the existing backend action endpoints; no client-only fake success state.
- AI writing creates previews/drafts first. Sending remains an explicit user action.
- Initial cross-mailbox search is metadata/classification search; message body search is not part of the current backend contract.

## Dashboard

Frontend source: `apps/web/src/lib/dashboard-api.ts`

- `GET /dashboard/overview?range_days={1|7|30}`
  - operational counters
  - processing trend
  - category distribution
  - DecisionMemory / fast / deep classification source counts
  - mailbox health
  - backfill state
  - inference degraded state
- Dashboard drill-downs should navigate to `/app/search` with real filter query parameters.

No dashboard card may contain hard-coded KPI values.

## Cross-mailbox search

Frontend source: `apps/web/src/lib/dashboard-api.ts`

- `GET /dashboard/search`
- Current supported filters:
  - `q` (sender or subject)
  - `sender`
  - `account_id`
  - `date_from`
  - `date_to`
  - `category`
  - `subcategory`
  - `importance`
  - `urgency`
  - `action_required`
  - `review_required`
  - `suspicious_content`
  - `tag`
  - `destination_folder`
  - `classification_source`
  - `processed_state`
  - `limit`
  - `offset`

Do not expose a body-search control until a backend contract exists for it.

## Mailbox and folder data

Frontend source: `apps/web/src/lib/api.ts`

- `GET /accounts` — authorized account list
- `GET /mail-client/accounts/{account_id}/metadata` — capabilities and actual folders
- `GET /mail-client/inbox` — unified/filtered message list
- `GET /mail-client/accounts/{account_id}/messages/{uid}?folder=...` — message detail
- `GET /mail-client/accounts/{account_id}/threads/{thread_id}` — thread detail and persisted insights

Folder trees must be rendered from mailbox metadata. Do not ship a static Inbox/Sent/Archive tree as application data.

## Message actions / context menu / drag and drop

Frontend source: `apps/web/src/lib/api.ts`

- `POST /mail-client/accounts/{account_id}/messages/{uid}/actions?folder=...`

Existing action names:

- `mark_read`
- `mark_unread`
- `flag`
- `unflag`
- `move`
- `archive`
- `trash`
- `spam`
- `restore`
- `add_tags`
- `remove_tags`

Move uses `destination_folder`.

Current product rule: move/drag-and-drop is same-account only. Cross-account drop must be rejected by the UI and must not simulate success.

Undo for move must use the existing move/undo backend behavior rather than restoring local UI state only.

## Composer and AI writing

Frontend source: `apps/web/src/lib/api.ts`

Draft lifecycle:

- `GET /mail/drafts`
- `GET /mail/drafts/{id}`
- `POST /mail/drafts`
- `PATCH /mail/drafts/{id}`
- `DELETE /mail/drafts/{id}`

Attachments:

- `POST /mail/drafts/{id}/attachments`
- `DELETE /mail/drafts/{draft_id}/attachments/{attachment_id}`

AI writing:

- `POST /mail/drafts/{draft_id}/ai/preview`

Pre-send and send:

- `GET /mail/drafts/{id}/pre-send`
- `POST /mail/drafts/{id}/send`

The UI must never make an AI preview endpoint imply that mail has been sent.

## Review and DecisionMemory

DecisionMemory frontend contracts live in `apps/web/src/lib/api.ts`.

- `GET /accounts/{account_id}/decision-memory`
- `PUT /accounts/{account_id}/decision-memory/{entry_id}`
- `DELETE /accounts/{account_id}/decision-memory/{entry_id}`

DecisionMemory learns only from explicit human-confirmed/corrected decisions. UI copy and interaction must not imply passive learning from every AI classification.

## Notifications and daily summary

Frontend contracts live in the attention API client (`apps/web/src/lib/attention-api.ts`).

The redesign must bind notification badges, notification rows and summary states to these responses rather than fixture counts.

## User preferences

Backend preference persistence is per user and organization.

Current/being-prepared fields:

- locale: `de | en | es`
- theme: `light | dark | system`
- density: `comfortable | compact`
- workspace layout: `classic | vertical | focus | compact | wide`

The visual implementation is intentionally deferred until the final Figma design is ready.

## Required implementation behavior after Figma handoff

For every Figma data surface, implementation must identify one of:

1. an existing endpoint listed above,
2. an existing local UI state derived from a real endpoint, or
3. a missing backend capability that must be implemented before the control becomes active.

Never use a fourth option: hard-coded demo data.
