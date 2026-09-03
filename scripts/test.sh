#!/usr/bin/env bash
set -euo pipefail

step() {
  printf '\n==> %s\n' "$1"
}

step "Install Python dependencies"
uv sync --all-packages

step "Install JavaScript dependencies"
pnpm install --frozen-lockfile

step "Ruff lint"
uv run ruff check .

step "Ruff format check"
uv run ruff format --check .

step "Core tests"
uv run pytest packages/core/tests/ -m "not integration" --cov=mailflow_core --cov-fail-under=80

step "API tests"
(
  cd apps/api
  uv run pytest tests -m "not integration" --cov=app --cov-fail-under=70
)

step "Biome"
pnpm biome check .

step "TypeScript typecheck"
pnpm typecheck

printf '\nAll containerized checks passed.\n'
