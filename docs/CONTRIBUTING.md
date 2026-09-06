# Contributing to Mailflow

Mailflow is open source under AGPL-3.0.

## Development setup

### Prerequisites

- Python 3.13+
- Node.js 20+
- pnpm 9+
- uv
- Docker + Docker Compose for local services

### Quick start

```bash
git clone https://github.com/mcpdev80/MAILFLOW-AI_MAILING.git
cd MAILFLOW-AI_MAILING

docker compose -f infrastructure/docker-compose.dev.yml up -d postgres redis

uv sync --all-packages
uvicorn apps.api.app.main:app --reload

pnpm install
pnpm dev
```

### Validation

```bash
# Python tests
uv run pytest packages/core/tests/ --cov=mailflow_core --cov-fail-under=80

# Python lint / format check
uv run ruff check .
uv run ruff format --check .

# Frontend
pnpm typecheck
pnpm biome check .
```

## Code standards

- Python follows the repository Ruff configuration.
- TypeScript follows the repository Biome configuration.
- Domain logic in `packages/core` is developed test-first and retains at least 80% coverage.
- Keep functions below 50 lines and source files below 400 lines; split controller/data logic from presentation when a screen becomes complex.
- Technical identifiers and code are English.
- User-visible frontend copy belongs in the DE/EN/ES locale catalogs, with English as the fallback language.
- Do not commit hard-coded credentials, API keys, demo mail, demo users or fake production counters/states.
- Preserve mailbox authorization boundaries and explicit-user-action outbound mail safety.
- Treat Figma as a visual reference. Do not change backend/domain behavior merely to mirror a mockup.

## Pull request process

1. Create a focused branch such as `feat/your-feature` or `fix/your-bug`.
2. Add or update tests for changed domain behavior.
3. Run the smallest useful local/targeted validation while developing.
4. Before merge, run the required full CI once on the final intended revision.
5. Open or update the PR against `main` with a clear description of behavior and migration impact.

## Commit messages

Use conventional, concise messages, for example:

```text
feat: add Gmail OAuth2 provider
fix: handle UIDVALIDITY change in IMAP
docs: update self-hosting guide
test: add classification cascade tests
```

## Architecture decisions

Read `docs/PLAN.md`, `docs/ARCHITECTURE.md` and the current ADRs before making significant changes. New architectural decisions belong in `docs/adr/`.

## Code of conduct

Be respectful and focus on technical merit. English is preferred for code and technical documentation; product UI is localized independently.
