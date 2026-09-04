#!/usr/bin/env bash
set -euo pipefail

# Format only files that belong to the current change. Formatting the complete
# repository makes feature branches pick up unrelated style-only changes from
# older code, which creates noisy diffs and violates MailFlow's incremental
# development guideline.
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

if [ ${#python_files[@]} -gt 0 ]; then
  printf '\n==> Ruff import/lint autofix (%d changed files)\n' "${#python_files[@]}"
  uvx --from ruff==0.15.12 ruff check "${python_files[@]}" --fix

  printf '\n==> Ruff format\n'
  uvx --from ruff==0.15.12 ruff format "${python_files[@]}"
else
  printf '\n==> Ruff: no changed Python files\n'
fi

if [ ${#web_files[@]} -gt 0 ]; then
  printf '\n==> Biome format/import fixes (%d changed files)\n' "${#web_files[@]}"
  pnpm dlx @biomejs/biome@1.9.4 check "${web_files[@]}" --write
else
  printf '\n==> Biome: no changed web files\n'
fi

printf '\nFormatting complete. Run make test afterwards.\n'
