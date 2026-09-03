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

extract_last() {
  local pattern=$1
  grep -E "$pattern" "$log_file" | tail -n 1 || true
}

core_summary=$(extract_last '[0-9]+ passed, [0-9]+ deselected.* in ')
api_summary=$(grep -E '[0-9]+ passed, [0-9]+ deselected.* in ' "$log_file" | tail -n 1 || true)
coverage_lines=$(grep -E 'Required test coverage of [0-9]+% reached\. Total coverage:' "$log_file" || true)
core_coverage=$(printf '%s\n' "$coverage_lines" | sed -n '1p')
api_coverage=$(printf '%s\n' "$coverage_lines" | sed -n '2p')

status_for() {
  local success_pattern=$1
  local failure_pattern=${2:-}
  if grep -Eq "$success_pattern" "$log_file"; then
    printf 'PASS'
  elif [ -n "$failure_pattern" ] && grep -Eq "$failure_pattern" "$log_file"; then
    printf 'FAIL'
  else
    printf 'UNKNOWN'
  fi
}

ruff_lint=$(status_for 'All checks passed!')
ruff_format=$(status_for '[0-9]+ files? already formatted|files? left unchanged' 'Would reformat:')
biome=$(status_for 'Checked [0-9]+ files .* No fixes applied\.')
typecheck=$(status_for 'Tasks:[[:space:]]+1 successful, 1 total')
docker_build=$(status_for 'naming to docker\.io/library/mailflow-api:test|exporting to image' 'ERROR: failed to solve|failed to build')

{
  printf '# MailFlow local test report\n\n'
  printf -- '- **Result:** %s\n' "$result"
  printf -- '- **Timestamp:** %s\n' "$timestamp"
  printf -- '- **Branch:** `%s`\n' "$branch"
  printf -- '- **Commit:** `%s` (`%s`)\n' "$commit" "$short_commit"
  printf -- '- **Command:** `make test`\n\n'

  printf '## Summary\n\n'
  printf '| Check | Result | Details |\n'
  printf '| --- | --- | --- |\n'
  printf '| Ruff lint | %s | |\n' "$ruff_lint"
  printf '| Ruff format | %s | |\n' "$ruff_format"
  printf '| Core pytest | %s | %s |\n' "$( [ -n "$core_summary" ] && printf PASS || printf UNKNOWN )" "${core_summary:-not found}"
  printf '| Core coverage | %s | %s |\n' "$( [ -n "$core_coverage" ] && printf PASS || printf UNKNOWN )" "${core_coverage:-not found}"
  printf '| API pytest | %s | %s |\n' "$( [ -n "$api_summary" ] && printf PASS || printf UNKNOWN )" "${api_summary:-not found}"
  printf '| API coverage | %s | %s |\n' "$( [ -n "$api_coverage" ] && printf PASS || printf UNKNOWN )" "${api_coverage:-not found}"
  printf '| Biome | %s | |\n' "$biome"
  printf '| TypeScript typecheck | %s | |\n' "$typecheck"
  printf '| API Docker build | %s | |\n' "$docker_build"

  printf '\n## Full output\n\n'
  printf '```text\n'
  cat "$log_file"
  printf '\n```\n'
} > "$report_file"

printf '\nTest report written to: %s\n' "$report_file"
