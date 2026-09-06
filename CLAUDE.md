# Mailflow — Development Instructions

> Product: **Mailflow** — privacy-oriented AI email client, open source AGPL + optional SaaS.
> Stack: Next.js 15 + FastAPI + PostgreSQL + LiteLLM + Better Auth + ARQ
> Master plan: `docs/PLAN.md`

---

## Monorepo structure

```text
mailflow/
├── apps/
│   ├── web/          Next.js 15 frontend (pnpm)
│   ├── api/          FastAPI backend (uv)
│   └── worker/       ARQ worker (same Python package as api)
├── packages/
│   ├── core/         Framework-independent domain logic
│   └── ui/           Shared React components where appropriate
├── infrastructure/   Docker and deployment assets
├── docs/             Architecture, contribution guide and ADRs
└── .github/          CI/CD workflows
```

## Rules

- Code and technical identifiers are written in English.
- User-visible UI strings must use the web i18n catalogs with English fallback and German/English/Spanish support. Do not introduce new hard-coded UI copy.
- Functions should stay below 50 lines and source files below 400 lines. Split controllers, domain logic and presentation instead of building page monoliths.
- TDD is mandatory for domain logic in `packages/core/`.
- Coverage must remain at least 80% for the covered core scope before merge.
- Never hard-code credentials, passwords, tokens or API keys.
- Never fabricate demo mail, users, folders, counters or backend states in production UI. Bind product surfaces to real APIs or explicit derived state.
- AI output must never send mail autonomously. Outbound mail is persisted as a draft and may only be sent through an explicit user action using the send API.
- DecisionMemory may only learn reusable decisions from explicit human confirmation or correction. Observed AI output alone must not become trusted memory.
- Preserve mailbox authorization boundaries: private mailboxes remain private; shared mailbox content is visible only to explicitly granted users. Administrative management access does not imply content access.
- Treat Figma as a visual design reference, not as a backend or product contract. Existing API contracts, permissions, domain rules and performance constraints are technically authoritative.
- Read current ADRs before changing established domain behavior.

## Common commands

```bash
# Backend
uv sync
uvicorn apps.api.app.main:app --reload

# Python tests
pytest packages/core/tests/
pytest --cov=mailflow_core --cov-fail-under=80

# Frontend
pnpm install
pnpm dev

# Lint / format
ruff check .
ruff format .
pnpm biome check .
```

## Relevant inherited ADRs

- ADR-003 Signature stripping with email-reply-parser + fallback handling
- ADR-004 Do not overwrite user-created drafts
- ADR-005 Feedback loop / corrections
- ADR-006 Audit trail with cycle_id
- ADR-007 Separate model roles for classification and generation
- ADR-008 Coverage ≥ 80% pytest
- ADR-012 FIFO backlog processing
