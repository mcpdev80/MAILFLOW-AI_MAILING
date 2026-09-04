#!/usr/bin/env bash
set -euo pipefail

log_file=${1:?usage: test-report.sh LOG_FILE EXIT_CODE [REPORT_FILE]}
exit_code=${2:?usage: test-report.sh LOG_FILE EXIT_CODE [REPORT_FILE]}
report_file=${3:-test-report.md}

branch=$(git branch --show-current 2>/dev/null || printf 'unknown')
commit=$(git rev-parse HEAD 2>/dev/null || printf 'unknown')
short_commit=$(git rev-parse --short HEAD 2>/dev/null || printf 'unknown')
timestamp=$(date --iso-8601=seconds)

result="PASS"
if [ "$exit_code" -ne 0 ]; then
  result="FAIL"
fi

status_for() {
  local success_pattern=$1
  local failure_pattern=${2:-}
  if [ -n "$failure_pattern" ] && grep -Eq "$failure_pattern" "$log_file"; then
    printf 'FAIL'
  elif grep -Eq "$success_pattern" "$log_file"; then
    printf 'PASS'
  else
    printf 'NOT RUN'
  fi
}

ruff_lint=$(status_for 'All checks passed!' '(^|[[:space:]])error:|Found [1-9][0-9]* error')
ruff_format=$(status_for '[0-9]+ files? already formatted|files? left unchanged' 'Would reformat:')
core_pytest=$(status_for 'packages/core/tests/.*[0-9]+ passed|[0-9]+ passed, [0-9]+ deselected.* in ' 'FAILED .*packages/core|ERROR .*packages/core|coverage failure')
api_pytest=$(status_for 'tests/unit/.*100%|[0-9]+ passed, [0-9]+ deselected.* in ' 'FAILED .*tests/|ERROR .*tests/|coverage failure')
biome=$(status_for 'Checked [0-9]+ files .* No fixes applied\.' 'Found [1-9][0-9]* errors?|format ━|organizeImports ━')
typecheck=$(status_for 'Tasks:[[:space:]]+1 successful, 1 total' 'error TS[0-9]+:|Tasks:.*failed')
docker_build=$(status_for 'naming to docker\.io/library/mailflow-api:test|exporting to image' 'ERROR: failed to solve|failed to build')

{
  printf '# MailFlow local test report\n\n'
  printf -- '- **Result:** %s\n' "$result"
  printf -- '- **Timestamp:** %s\n' "$timestamp"
  printf -- '- **Branch:** `%s`\n' "$branch"
  printf -- '- **Commit:** `%s` (`%s`)\n\n' "$commit" "$short_commit"

  if [ "$result" = "PASS" ]; then
    printf 'All checks passed.\n'
  else
    printf '## Check status\n\n'
    printf '| Check | Result |\n'
    printf '| --- | --- |\n'
    printf '| Ruff lint | %s |\n' "$ruff_lint"
    printf '| Ruff format | %s |\n' "$ruff_format"
    printf '| Core pytest | %s |\n' "$core_pytest"
    printf '| API pytest | %s |\n' "$api_pytest"
    printf '| Biome | %s |\n' "$biome"
    printf '| TypeScript typecheck | %s |\n' "$typecheck"
    printf '| API Docker build | %s |\n' "$docker_build"

    printf '\n## Failure output\n\n'
    printf '```text\n'
    grep -E -B 3 -A 20 \
      'Would reformat:|FAILED |ERROR |Traceback|AssertionError|coverage failure|error TS[0-9]+:|Found [1-9][0-9]* errors?|ERROR: failed to solve|failed to build|make: \*\*\*' \
      "$log_file" || tail -n 120 "$log_file"
    printf '\n```\n'
  fi
} > "$report_file"

printf '\nTest report written to: %s\n' "$report_file"
