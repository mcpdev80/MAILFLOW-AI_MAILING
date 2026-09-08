#!/usr/bin/env bash
set -euo pipefail

ROOT="${MAILFLOW_ROOT:-}"
if [ -z "$ROOT" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
ROOT="$(cd "$ROOT" 2>/dev/null && pwd || true)"
ENV_FILE="$ROOT/.env"
COMPOSE_FILE="$ROOT/infrastructure/docker-compose.yml"
TLS_COMPOSE_FILE="$ROOT/infrastructure/docker-compose.custom-tls.yml"
BACKUP_ROOT="$ROOT/.mailflow/backups"
BRANCH="${MAILFLOW_INSTALL_REF:-}"
COMPOSE_ARGS=()
BACKUP_PATH=""

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

say() {
  printf '\n==> %s\n' "$*"
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "$2"
}

get_env() {
  local key="$1" file="${2:-$ENV_FILE}"
  [ -f "$file" ] || return 0
  awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/, ""); print; exit}' "$file"
}

is_install() {
  [ -n "$ROOT" ] && [ -d "$ROOT/.git" ] && [ -f "$COMPOSE_FILE" ] && [ -f "$ENV_FILE" ]
}

load_compose() {
  local tls_mode
  COMPOSE_ARGS=(--env-file "$ENV_FILE" -f "$COMPOSE_FILE")
  tls_mode="$(get_env MAILFLOW_TLS_MODE)"
  [ "$tls_mode" != "custom" ] || COMPOSE_ARGS+=(-f "$TLS_COMPOSE_FILE")
}

compose() {
  docker compose "${COMPOSE_ARGS[@]}" "$@"
}

public_host() {
  local value="$1" authority
  authority="${value#*://}"
  authority="${authority%%/*}"
  printf '%s' "${authority%%:*}"
}

public_port() {
  local value="$1" authority
  authority="${value#*://}"
  authority="${authority%%/*}"
  if [[ "$authority" == *:* ]]; then
    printf '%s' "${authority##*:}"
  elif [[ "$value" == https://* ]]; then
    printf '443'
  else
    printf '80'
  fi
}

current_branch() {
  local value
  value="$(git -C "$ROOT" branch --show-current 2>/dev/null || true)"
  printf '%s' "${BRANCH:-${value:-main}}"
}

current_version() {
  git -C "$ROOT" describe --tags --always --dirty 2>/dev/null || printf 'unknown'
}

ensure_runtime() {
  is_install || fail "No MailFlow installation found at $ROOT"
  need git "git is required."
  need docker "Docker is required."
  need gzip "gzip is required."
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."
  docker info >/dev/null 2>&1 || fail "Docker is not reachable."
  load_compose
  compose config >/dev/null || fail "Docker Compose configuration is invalid."
}

wait_postgres() {
  local ready=0
  compose up -d postgres >/dev/null
  for _ in $(seq 1 30); do
    if compose exec -T postgres pg_isready -U "${POSTGRES_USER:-$(get_env POSTGRES_USER)}" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  [ "$ready" -eq 1 ] || fail "PostgreSQL did not become ready."
}

postgres_user() {
  local value
  value="$(get_env POSTGRES_USER)"
  printf '%s' "${value:-mailflow}"
}

postgres_db() {
  local value
  value="$(get_env POSTGRES_DB)"
  printf '%s' "${value:-mailflow}"
}

attachment_volume() {
  local cid
  cid="$(compose ps -aq api 2>/dev/null | head -n1)"
  [ -n "$cid" ] || cid="$(compose ps -aq worker 2>/dev/null | head -n1)"
  [ -n "$cid" ] || return 0
  docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data/attachments"}}{{.Name}}{{end}}{{end}}' "$cid" 2>/dev/null || true
}

create_backup() {
  local stamp commit dir user db volume
  ensure_runtime
  stamp="$(date '+%Y%m%d-%H%M%S')"
  commit="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || printf unknown)"
  dir="$BACKUP_ROOT/${stamp}-${commit}"
  mkdir -p "$dir"
  chmod 700 "$ROOT/.mailflow" "$BACKUP_ROOT" "$dir" 2>/dev/null || true

  say "Creating backup"
  wait_postgres
  user="$(postgres_user)"
  db="$(postgres_db)"
  compose exec -T postgres pg_dump -U "$user" -d "$db" --no-owner --no-privileges | gzip -9 > "$dir/database.sql.gz"
  cp "$ENV_FILE" "$dir/env"
  chmod 600 "$dir/env" "$dir/database.sql.gz"
  git -C "$ROOT" rev-parse HEAD > "$dir/git-commit"
  current_branch > "$dir/git-branch"

  if [ -d "$ROOT/.mailflow/tls" ]; then
    tar -C "$ROOT/.mailflow" -czf "$dir/tls.tar.gz" tls
    chmod 600 "$dir/tls.tar.gz"
  fi

  volume="$(attachment_volume)"
  if [ -n "$volume" ]; then
    if docker run --rm -v "$volume:/source:ro" caddy:2-alpine sh -c 'tar -C /source -czf - .' > "$dir/attachments.tar.gz"; then
      chmod 600 "$dir/attachments.tar.gz"
    else
      rm -f "$dir/attachments.tar.gz"
      printf 'WARNING: Attachment volume could not be backed up.\n' >&2
    fi
  fi

  cat > "$dir/manifest" <<EOF
created_at=$(date -Iseconds)
commit=$(git -C "$ROOT" rev-parse HEAD)
branch=$(current_branch)
database=$db
attachments=$([ -f "$dir/attachments.tar.gz" ] && printf yes || printf no)
tls=$([ -f "$dir/tls.tar.gz" ] && printf yes || printf no)
EOF
  chmod 600 "$dir/manifest"
  BACKUP_PATH="$dir"
  printf 'Backup: %s\n' "$dir"
}

restore_backup_internal() {
  local dir="$1" restart="${2:-1}" user db volume
  [ -d "$dir" ] || fail "Backup directory not found: $dir"
  [ -f "$dir/database.sql.gz" ] || fail "Backup is missing database.sql.gz"
  [ -f "$dir/env" ] || fail "Backup is missing env"

  say "Restoring backup $dir"
  compose stop api worker web edge >/dev/null 2>&1 || true
  cp "$dir/env" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  load_compose
  compose config >/dev/null || fail "Restored Docker Compose configuration is invalid."
  wait_postgres
  user="$(postgres_user)"
  db="$(postgres_db)"

  compose exec -T postgres dropdb --if-exists --force -U "$user" "$db"
  compose exec -T postgres createdb -U "$user" "$db"
  gzip -dc "$dir/database.sql.gz" | compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$user" -d "$db" >/dev/null

  if [ -f "$dir/tls.tar.gz" ]; then
    rm -rf "$ROOT/.mailflow/tls"
    mkdir -p "$ROOT/.mailflow"
    tar -C "$ROOT/.mailflow" -xzf "$dir/tls.tar.gz"
  fi

  if [ -f "$dir/attachments.tar.gz" ]; then
    volume="$(attachment_volume)"
    if [ -n "$volume" ]; then
      docker run --rm -v "$volume:/target" caddy:2-alpine sh -c 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} +'
      docker run --rm -i -v "$volume:/target" caddy:2-alpine sh -c 'tar -C /target -xzf -' < "$dir/attachments.tar.gz"
    else
      printf 'WARNING: Attachment volume could not be located during restore.\n' >&2
    fi
  fi

  if [ "$restart" = "1" ]; then
    MAILFLOW_SKIP_SELF_UPDATE=1 bash "$ROOT/scripts/resume.sh" "$ROOT"
  fi
}

confirm_restore() {
  local value
  if [ "${MAILFLOW_ASSUME_YES:-0}" = "1" ]; then
    return 0
  fi
  printf 'This replaces the current MailFlow database and persisted configuration. Continue? [y/N]: '
  IFS= read -r value
  case "${value,,}" in y|yes|j|ja|s|si) return 0 ;; *) return 1 ;; esac
}

cmd_backup() {
  create_backup
}

cmd_restore() {
  local dir="${1:-}"
  [ -n "$dir" ] || fail "Usage: ./mailflow restore <backup-directory> [--yes]"
  shift || true
  if [ "${1:-}" = "--yes" ]; then
    export MAILFLOW_ASSUME_YES=1
  fi
  ensure_runtime
  confirm_restore || fail "Restore cancelled."
  restore_backup_internal "$dir" 1
  printf '\nRestore completed successfully.\n'
}

cmd_status() {
  local db_revision="unavailable" public_url
  ensure_runtime
  public_url="$(get_env MAILFLOW_PUBLIC_URL)"
  if compose exec -T postgres psql -U "$(postgres_user)" -d "$(postgres_db)" -Atqc 'SELECT version_num FROM alembic_version' >/tmp/mailflow-schema.$$ 2>/dev/null; then
    db_revision="$(cat /tmp/mailflow-schema.$$)"
  fi
  rm -f /tmp/mailflow-schema.$$
  printf 'MailFlow\n'
  printf '  Install: %s\n' "$ROOT"
  printf '  Ref: %s\n' "$(current_branch)"
  printf '  Version: %s\n' "$(current_version)"
  printf '  Database schema: %s\n' "$db_revision"
  printf '  URL: %s\n\n' "${public_url:-unknown}"
  compose ps
}

check_line() {
  local ok="$1" label="$2"
  if [ "$ok" -eq 1 ]; then
    printf '  [OK] %s\n' "$label"
  else
    printf '  [FAIL] %s\n' "$label"
    DOCTOR_FAILED=1
  fi
}

cmd_doctor() {
  local public_url host port tls_mode api_ok=0 worker_ok=0 web_ok=0 edge_ok=0 db_ok=0 config_ok=0
  ensure_runtime
  DOCTOR_FAILED=0
  compose config >/dev/null 2>&1 && config_ok=1
  compose exec -T postgres pg_isready -U "$(postgres_user)" >/dev/null 2>&1 && db_ok=1
  compose exec -T api python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status == 200 else 1)" >/dev/null 2>&1 && api_ok=1
  [ "$(compose ps --status running -q worker 2>/dev/null | wc -l)" -gt 0 ] && worker_ok=1
  compose exec -T edge wget -q -O /dev/null -T 5 http://web:3000/ >/dev/null 2>&1 && web_ok=1

  public_url="$(get_env MAILFLOW_PUBLIC_URL)"
  tls_mode="$(get_env MAILFLOW_TLS_MODE)"
  if [ -n "$public_url" ]; then
    host="$(public_host "$public_url")"
    port="$(public_port "$public_url")"
    if [ "$tls_mode" = "custom" ]; then
      curl -fsS --connect-timeout 5 --resolve "$host:$port:127.0.0.1" "$public_url" >/dev/null 2>&1 && edge_ok=1
    else
      curl -kfsS --connect-timeout 5 --resolve "$host:$port:127.0.0.1" "$public_url" >/dev/null 2>&1 && edge_ok=1
    fi
  fi

  printf 'MailFlow doctor\n'
  check_line "$config_ok" "Compose configuration"
  check_line "$db_ok" "PostgreSQL"
  check_line "$api_ok" "API"
  check_line "$worker_ok" "Worker"
  check_line "$web_ok" "Web"
  check_line "$edge_ok" "Public URL / TLS"

  if [ "$DOCTOR_FAILED" -ne 0 ]; then
    printf '\nDiagnostics:\n'
    compose ps || true
    printf '\nAPI logs:\n'
    compose logs --tail 80 api 2>/dev/null || true
    return 1
  fi
  printf '\nAll checks passed.\n'
}

cmd_update() {
  local branch current target
  ensure_runtime
  branch="$(current_branch)"
  current="$(git -C "$ROOT" rev-parse HEAD)"

  if ! git -C "$ROOT" diff --quiet || ! git -C "$ROOT" diff --cached --quiet; then
    fail "The MailFlow checkout has local tracked changes. Commit or revert them before updating."
  fi

  say "Checking for updates on $branch"
  git -C "$ROOT" fetch origin "+refs/heads/$branch:refs/remotes/origin/$branch"
  target="$(git -C "$ROOT" rev-parse "origin/$branch")"
  if [ "$current" = "$target" ]; then
    printf 'MailFlow is already up to date (%s).\n' "$(current_version)"
    cmd_doctor
    return
  fi
  git -C "$ROOT" merge-base --is-ancestor "$current" "$target" || fail "Remote update is not a fast-forward. Refusing automatic update."

  printf 'Current: %s\n' "$(git -C "$ROOT" describe --tags --always "$current")"
  printf 'Target:  %s\n' "$(git -C "$ROOT" describe --tags --always "$target")"
  create_backup

  say "Updating MailFlow"
  git -C "$ROOT" checkout "$branch"
  git -C "$ROOT" merge --ff-only "origin/$branch"
  chmod +x "$ROOT/mailflow" "$ROOT/scripts/"*.sh 2>/dev/null || true

  if MAILFLOW_SKIP_SELF_UPDATE=1 bash "$ROOT/scripts/resume.sh" "$ROOT"; then
    printf '\nUpdate completed successfully.\n'
    printf 'Backup retained at: %s\n' "$BACKUP_PATH"
    return
  fi

  printf '\nUpdate failed. Rolling back automatically...\n' >&2
  git -C "$ROOT" reset --hard "$current"
  chmod +x "$ROOT/mailflow" "$ROOT/scripts/"*.sh 2>/dev/null || true
  load_compose
  restore_backup_internal "$BACKUP_PATH" 0
  if MAILFLOW_SKIP_SELF_UPDATE=1 bash "$ROOT/scripts/resume.sh" "$ROOT"; then
    fail "Update failed and MailFlow was rolled back successfully."
  fi
  fail "Update failed and automatic rollback could not restore a healthy stack. Backup: $BACKUP_PATH"
}

cmd_install() {
  local branch
  need bash "bash is required."
  branch="${MAILFLOW_INSTALL_REF:-$(current_branch)}"
  MAILFLOW_INSTALL_REF="$branch" exec bash "$ROOT/scripts/install-core.sh" "$branch"
}

usage() {
  cat <<'EOF'
MailFlow lifecycle CLI

Usage:
  ./mailflow install
  ./mailflow update
  ./mailflow status
  ./mailflow doctor
  ./mailflow backup
  ./mailflow restore <backup-directory> [--yes]

update creates a database/configuration/attachment backup before changing code,
runs migrations through the normal container startup, validates the complete
stack and automatically rolls back when the update fails.
EOF
}

command_name="${1:-help}"
shift || true
case "$command_name" in
  install) cmd_install "$@" ;;
  update) cmd_update "$@" ;;
  status) cmd_status "$@" ;;
  doctor) cmd_doctor "$@" ;;
  backup) cmd_backup "$@" ;;
  restore) cmd_restore "$@" ;;
  help|-h|--help) usage ;;
  *) usage; fail "Unknown command: $command_name" ;;
esac
