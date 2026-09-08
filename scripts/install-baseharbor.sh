#!/usr/bin/env bash
set -euo pipefail

ROOT="${MAILFLOW_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="$ROOT/.env"
APPLY_LOG="${TMPDIR:-/tmp}/mailflow-baseharbor-apply.$$"
trap 'rm -f "$APPLY_LOG"' EXIT

fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "$2"; }
set_env() {
  local key="$1" value="$2" file="$3"
  if grep -q "^${key}=" "$file"; then
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

need git "git is required."
need docker "Docker is required."
need baha "BaseHarbor CLI 'baha' is required. Install BaseHarbor first."
need openssl "openssl is required."

[ -d "$ROOT/.git" ] || fail "Run this command from a MailFlow checkout."
[ -f "$ROOT/baseharbor.yaml" ] || fail "baseharbor.yaml is missing."
docker info >/dev/null 2>&1 || fail "Docker is not reachable."

cd "$ROOT"
if [ ! -f "$ENV_FILE" ]; then
  cp .env.example "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi
set_env MAILFLOW_DEPLOYMENT_SOURCE baseharbor "$ENV_FILE"

printf '\n==> Checking BaseHarbor control plane\n'
baha status >/dev/null || fail "BaseHarbor is not ready. Start/configure it first with 'baha up' and 'baha doctor'."

printf '\n==> Preparing MailFlow application scope\n'
if ! baha app apply >"$APPLY_LOG" 2>&1; then
  if grep -q "required secrets check failed" "$APPLY_LOG"; then
    printf '==> Creating MailFlow SECRET_KEY in BaseHarbor/OpenBao\n'
    openssl rand -hex 32 | baha app secret set SECRET_KEY --stdin
  else
    cat "$APPLY_LOG" >&2
    fail "BaseHarbor could not prepare MailFlow."
  fi
else
  cat "$APPLY_LOG"
  : > "$APPLY_LOG"
fi

printf '\n==> Applying MailFlow through BaseHarbor\n'
baha app apply

printf '\n==> Verifying MailFlow\n'
baha app doctor

printf '\nMailFlow is ready.\n'
printf 'Manage it with:\n'
printf '  ./mailflow status\n'
printf '  ./mailflow doctor\n'
printf '  ./mailflow stop\n'
printf '  ./mailflow start\n'
