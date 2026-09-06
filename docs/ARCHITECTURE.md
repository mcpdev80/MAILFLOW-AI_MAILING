# Mailflow — Architecture Overview

See `PLAN.md` and the current ADRs for detailed domain decisions. This document describes the implementation shape that is authoritative for ongoing MVP work.

## Key Components

### packages/core

Framework-independent Python domain logic. It owns reusable email/provider/classification behavior and must not depend on frontend presentation details.

### apps/api

FastAPI HTTP application.

- `routers/` exposes domain APIs such as accounts, mail client, outbound mail, DecisionMemory, attention/review, dashboard/search and preferences.
- `models/` contains SQLAlchemy persistence models.
- domain/services modules implement authorization-aware application behavior.
- Better Auth identity is resolved at the API boundary and mailbox access is enforced server-side.

Private mailbox content is only visible to its owner. Shared mailbox content is only visible to explicitly granted users. Being allowed to administratively manage a shared mailbox does not automatically grant access to its mail content.

### apps/worker

ARQ asynchronous processing for mailbox cycles and background work. Processing must remain resumable and avoid unnecessary LLM calls. Persisted state is preferred over repeatedly regenerating information.

### apps/web

Next.js 15 App Router frontend.

- authenticated product routes live below `/app`.
- UI localization uses the lightweight catalog-based `I18nProvider` in `apps/web/src/lib/i18n.tsx`; there is no locale URL prefix and no `next-intl` runtime.
- supported MVP UI languages are German, English and Spanish with English fallback.
- locale, theme, density and workspace preferences are persisted per user through `/user/preferences`.
- desktop web is the current MVP target. Tablet/mobile interaction designs are documented for post-MVP implementation.
- Figma is a visual reference only. API contracts, permissions, domain behavior and real application state are technically authoritative.
- production screens must use real backend data or explicit derived state. Figma/demo values must never ship as fixtures disguised as product data.

## Mail workspace and search

The web workspace consumes the real mail-client APIs for:

- authorized account list and mailbox metadata
- unified inbox and folder views
- message and thread detail
- message actions and same-account move/undo
- draft/compose, attachments, AI writing preview, pre-send checks and explicit send
- cross-mailbox metadata search

Cross-account moves are not part of the current MVP contract. Virtual AI/category views are not physical folder move targets.

## AI and DecisionMemory

AI is used only where it materially improves classification, summarization or writing. Avoid extra model calls when persisted or deterministic state is sufficient.

DecisionMemory is trusted only when a human explicitly confirms or corrects a decision. AI-observed output alone must not become reusable trusted memory. Editing a stored decision is itself an explicit human correction.

Thread summaries are incremental: update the existing persisted summary with the new message rather than reprocessing the complete thread unnecessarily.

## Outbound mail safety

Outbound mail uses a persisted draft lifecycle.

- AI writing actions produce preview content only.
- AI output is never sent autonomously.
- the user must explicitly trigger Send.
- the API performs a pre-send check before the send endpoint is called.
- user-created draft content must not be silently overwritten (ADR-004).
- send failures keep the draft recoverable and visible.

## IMAP safety rules

- Use UIDs for message operations.
- Detect folder separators dynamically through LIST.
- Detect special-use folders from server attributes where possible rather than assuming localized names.
- Destructive move/delete sequences must fail safely; a failed copy/move must not result in an unconditional expunge.
- Track UIDVALIDITY and invalidate stale cached state when it changes.

## Frontend implementation rules

- Keep data/controller logic separate from presentation for complex screens.
- Keep user-visible copy in DE/EN/ES locale catalogs.
- Render loading, empty, error and permission states from real application conditions.
- Do not implement a Figma control when no real backend/product capability exists. Either omit it for the MVP or add an explicit backend contract first.
- Theme and workspace customization must remain per-user and must not weaken authorization or mailbox boundaries.
