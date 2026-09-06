# Contributing to Mailflow

Mailflow is open source under AGPL-3.0.

## Contribution licensing and authorship

By submitting a contribution to this repository, you agree that your contribution may be distributed as part of this project under the **AGPL-3.0**, consistent with the license of the repository.

You retain copyright in your original contribution unless you explicitly assign it otherwise.

By submitting a contribution, you represent that you have the right to submit it under these terms. Do not contribute code, documentation, media, or other material that you do not have permission to license under terms compatible with this project.

Do not remove existing copyright, license, provenance, warranty, or modification notices unless the change is legally justified and clearly documented in the pull request.

Contributions should identify material copied or adapted from third-party sources and state the applicable license and source where required.

## AI-assisted contributions

AI-assisted development tools may be used. Contributors remain responsible for everything they submit, including review, correctness, security, licensing, confidentiality, and third-party rights.

If generative AI materially assisted a contribution, disclose that fact in the pull request description. The disclosure should name the tool when known and briefly describe how it was used, for example for implementation suggestions, refactoring, tests, debugging, or documentation.

Do not treat an AI system as a legal author or copyright holder. Do not use AI-generated suggestions to bypass copyright, confidentiality, contractual, or licensing obligations. See [`../AI_ASSISTANCE.md`](../AI_ASSISTANCE.md) for the project's transparency statement.

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
5. Document third-party code or assets introduced by the change, including license information where applicable.
6. Disclose material use of generative AI in the PR description.
7. Open or update the PR against `main` with a clear description of behavior and migration impact.

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
