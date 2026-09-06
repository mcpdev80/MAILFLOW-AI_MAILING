# Contributing to MailFlow

Thank you for your interest in contributing. MailFlow is distributed under the GNU Affero General Public License v3.0 (AGPL-3.0).

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

## Development Setup

### Prerequisites
- Python 3.13+
- Node.js 20+
- pnpm 9+
- uv (Python package manager)
- Docker + Docker Compose (for local services)

### Quick Start

```bash
git clone https://github.com/mcpdev80/MAILFLOW-AI_MAILING.git
cd MAILFLOW-AI_MAILING

# Start local services (Postgres + Redis)
docker compose -f infrastructure/docker-compose.dev.yml up -d postgres redis

# Backend
uv sync --all-packages
uvicorn apps.api.app.main:app --reload

# Frontend (separate terminal)
pnpm install
pnpm dev
```

### Running Tests

```bash
# Python tests
uv run pytest packages/core/tests/ --cov=mailflow_core --cov-fail-under=80

# Lint
uv run ruff check .
uv run ruff format --check .

# TypeScript
pnpm typecheck
pnpm biome check .
```

## Code Standards

- Python: follow `ruff` rules (see `pyproject.toml`)
- TypeScript: follow Biome rules
- Test coverage: 80% minimum for `packages/core`
- All functions < 50 lines, all files < 400 lines

## Pull Request Process

1. Fork the repo and create a branch: `feat/your-feature` or `fix/your-bug`
2. Write tests for behavior changes
3. Ensure CI passes (lint + tests)
4. Document third-party code or assets introduced by the change, including license information where applicable
5. Disclose material use of generative AI in the PR description
6. Open a PR against `main` with a clear description

## Commit Message Format

```
feat: add Gmail OAuth2 provider
fix: handle UIDVALIDITY change in IMAP
docs: update self-hosting guide
test: add classification cascade tests
```

## Architecture Decisions

Read `docs/PLAN.md` and `docs/ARCHITECTURE.md` before making significant changes.
New architectural decisions go in `docs/adr/`.

## Code of Conduct

Be respectful. Focus on technical merit. English is preferred in code and comments; other languages are welcome in discussions.
