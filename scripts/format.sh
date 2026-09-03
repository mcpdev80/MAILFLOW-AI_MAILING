#!/usr/bin/env bash
set -euo pipefail

printf '\n==> Ruff format\n'
uv sync --all-packages
uv run ruff format .

printf '\n==> Ruff import/lint autofix\n'
uv run ruff check . --fix

printf '\n==> Biome format/import fixes\n'
pnpm install --frozen-lockfile
pnpm biome check . --write

printf '\nFormatting complete. Run make test afterwards.\n'
