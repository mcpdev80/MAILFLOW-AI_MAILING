#!/usr/bin/env bash
set -euo pipefail

ROOT="${MAILFLOW_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="$ROOT/.env"
APPLY_LOG="${TMPDIR:-/tmp}/mailflow-baseharbor-apply.$$"
BOOTSTRAP_TMP=""
LOCAL_BIN="${XDG_BIN_HOME:-${HOME:-}/.local/bin}"
BASEHARBOR_REPO="${MAILFLOW_BASEHARBOR_REPO:-https://github.com/mcpdev80/baseharbor.git}"
BASEHARBOR_REF="${MAILFLOW_BASEHARBOR_REF:-main}"
RECOVERY_ROOT="${XDG_DATA_HOME:-${HOME:-}/.local/share}/baseharbor/recovery"
RECOVERY_FILE="${MAILFLOW_BASEHARBOR_RECOVERY_FILE:-$RECOVERY_ROOT/openbao-recovery.json}"

cleanup() {
  rm -f "$APPLY_LOG"
  [ -z "$BOOTSTRAP_TMP" ] || rm -rf "$BOOTSTRAP_TMP"
}
trap cleanup EXIT

fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
say() { printf '\n==> %s\n' "$*"; }
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

prepare_local_bin() {
  [ -n "${HOME:-}" ] || fail "HOME is required to install the BaseHarbor CLI automatically."
  mkdir -p "$LOCAL_BIN"
  chmod 700 "$LOCAL_BIN" 2>/dev/null || true
  PATH="$LOCAL_BIN:$PATH"
  export PATH
}

install_baha() {
  if command -v baha >/dev/null 2>&1; then
    printf '==> BaseHarbor CLI detected: %s\n' "$(command -v baha)"
    return
  fi

  prepare_local_bin
  if [ -x "$LOCAL_BIN/baha" ]; then
    printf '==> BaseHarbor CLI detected: %s\n' "$LOCAL_BIN/baha"
    return
  fi

  say "Installing BaseHarbor CLI"
  BOOTSTRAP_TMP="$(mktemp -d)"
  local source_dir="$BOOTSTRAP_TMP/baseharbor" out_dir="$BOOTSTRAP_TMP/out"
  mkdir -p "$out_dir"

  git clone --depth 1 "$BASEHARBOR_REPO" "$source_dir" >/dev/null 2>&1 || fail "Could not download BaseHarbor from $BASEHARBOR_REPO"
  if [ "$BASEHARBOR_REF" != "main" ]; then
    git -C "$source_dir" fetch --depth 1 origin "$BASEHARBOR_REF" >/dev/null 2>&1 || fail "Could not fetch BaseHarbor ref $BASEHARBOR_REF"
    git -C "$source_dir" checkout --detach FETCH_HEAD >/dev/null 2>&1 || fail "Could not check out BaseHarbor ref $BASEHARBOR_REF"
  fi

  docker run --rm \
    -v "$source_dir:/src:ro" \
    -v "$out_dir:/out" \
    -w /src \
    golang:1.25-alpine \
    sh -ec 'CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/baha ./cmd/baha' \
    >/dev/null || fail "Could not build the BaseHarbor CLI."

  cp "$out_dir/baha" "$LOCAL_BIN/baha"
  chmod 755 "$LOCAL_BIN/baha"
  hash -r 2>/dev/null || true
  command -v baha >/dev/null 2>&1 || fail "BaseHarbor CLI was installed but is not executable."
  printf '[OK] BaseHarbor CLI installed at %s\n' "$LOCAL_BIN/baha"
}

openbao_status_output() {
  baha openbao status 2>&1 || true
}

ensure_control_plane() {
  local status attempt

  if baha status >/dev/null 2>&1; then
    printf '==> BaseHarbor control plane is ready\n'
    return
  fi

  say "Starting BaseHarbor control plane"
  baha up

  for attempt in $(seq 1 30); do
    if baha openbao status >/dev/null 2>&1; then
      baha status >/dev/null 2>&1 && {
        printf '[OK] BaseHarbor control plane is ready\n'
        return
      }
    fi

    status="$(openbao_status_output)"

    if printf '%s\n' "$status" | grep -qE 'not initialized|initialized[[:space:]]+no'; then
      if [ -e "$RECOVERY_FILE" ]; then
        fail "OpenBao is not initialized but recovery file $RECOVERY_FILE already exists. Move or back up that file before creating a new trust plane."
      fi
      mkdir -p "$RECOVERY_ROOT"
      chmod 700 "$RECOVERY_ROOT"
      if baha openbao bootstrap --recovery-file "$RECOVERY_FILE"; then
        chmod 600 "$RECOVERY_FILE" 2>/dev/null || true
        printf '[OK] OpenBao initialized; recovery material stored at %s\n' "$RECOVERY_FILE"
      fi
    elif printf '%s\n' "$status" | grep -qE 'OpenBao is sealed|unsealed[[:space:]]+no'; then
      [ -f "$RECOVERY_FILE" ] || fail "OpenBao is sealed and recovery material was not found at $RECOVERY_FILE"
      baha openbao unseal --recovery-file "$RECOVERY_FILE" || true
    fi

    sleep 2
  done

  baha status || true
  fail "BaseHarbor control plane did not become ready."
}

need git "git is required."
need docker "Docker is required."
need openssl "openssl is required."

[ -d "$ROOT/.git" ] || fail "Run this command from a MailFlow checkout."
[ -f "$ROOT/baseharbor.yaml" ] || fail "baseharbor.yaml is missing."
docker info >/dev/null 2>&1 || fail "Docker is not reachable."

prepare_local_bin
install_baha

cd "$ROOT"
if [ ! -f "$ENV_FILE" ]; then
  cp .env.example "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi
set_env MAILFLOW_DEPLOYMENT_SOURCE baseharbor "$ENV_FILE"

ensure_control_plane

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
printf '\nBaseHarbor recovery material:\n'
printf '  %s\n' "$RECOVERY_FILE"
printf 'Keep an additional offline backup of this file.\n'