#!/usr/bin/env bash
set -euo pipefail

step() {
  printf '\n==> %s\n' "$1"
}

base_ref=${FORMAT_BASE_REF:-origin/main}
if ! git rev-parse --verify "$base_ref" >/dev/null 2>&1; then
  base_ref=main
fi
base_commit=$(git merge-base HEAD "$base_ref")

mapfile -t changed_files < <(
  {
    git diff --name-only --diff-filter=ACMR "$base_commit"...HEAD
    git diff --name-only --diff-filter=ACMR
    git diff --cached --name-only --diff-filter=ACMR
  } | sort -u
)

python_files=()
web_files=()
for file in "${changed_files[@]}"; do
  [ -f "$file" ] || continue
  case "$file" in
    *.py)
      python_files+=("$file")
      ;;
    *.js|*.jsx|*.ts|*.tsx|*.json|*.jsonc)
      web_files+=("$file")
      ;;
  esac
done

step "Install Python dependencies"
uv sync --all-packages

step "Install JavaScript dependencies"
pnpm install --frozen-lockfile

step "Ruff lint"
uv run ruff check .

step "Ruff format check"
if [ ${#python_files[@]} -gt 0 ]; then
  uv run ruff format --check "${python_files[@]}"
else
  printf 'No changed Python files.\n'
fi

step "Core tests"
uv run pytest packages/core/tests/ -m "not integration" --cov=mailflow_core --cov-fail-under=80

step "API tests"
(
  cd apps/api
  uv run pytest tests -m "not integration" --cov=app --cov-fail-under=70
)

step "Biome"
if [ ${#web_files[@]} -gt 0 ]; then
  pnpm biome check "${web_files[@]}"
else
  printf 'No changed web files.\n'
fi

step "TypeScript typecheck"
pnpm typecheck

printf '\nAll containerized checks passed.\n'
