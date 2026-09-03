#!/usr/bin/env bash
set -euo pipefail

printf '\n==> Ruff import/lint autofix\n'
uvx --from ruff==0.15.12 ruff check . --fix

printf '\n==> Ruff format\n'
uvx --from ruff==0.15.12 ruff format .

printf '\n==> Biome format/import fixes\n'
pnpm dlx @biomejs/biome@1.9.4 check . --write

printf '\nFormatting complete. Run make test afterwards.\n'
