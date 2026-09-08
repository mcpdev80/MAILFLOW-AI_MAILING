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
STANDALONE_COMPOSE_FILE="$ROOT/infrastructure/docker-compose.standalone.yml"
TLS_COMPOSE_FILE="$ROOT/infrastructure/docker-compose.custom-tls.yml"
BACKUP_ROOT="$ROOT/.mailflow/backups"
RUNTIME_MODE="${MAILFLOW_RUNTIME:-baseharbor}"

fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
say() { printf '\n==> %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || fail "$2"; }

get_env() {
  local key="$1" file="${2:-$ENV_FILE}"
  [ -f "$file" ] || return 0
  awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/, ""); print; exit}' "$file"
}

current_branch() {
  git -C "$ROOT" branch --show-current 2>/dev/null || printf 'main'
}

current_version() {
  git -C "$ROOT" describe --tags --always --dirty 2>/dev/null || printf 'unknown'
}

ensure_checkout() {
  [ -d "$ROOT/.git" ] || fail "No MailFlow checkout found at $ROOT"
  [ -f "$ROOT/baseharbor.yaml" ] || fail "baseharbor.yaml is missing."
  [ -f "$COMPOSE_FILE" ] || fail "MailFlow workload Compose file is missing."
  need git "git is required."
  need docker "Docker is required."
  docker info >/dev/null 2>&1 || fail "Docker is not reachable."
}

ensure_baseharbor() {
  ensure_checkout
  need baha "BaseHarbor CLI 'baha' is required. Install BaseHarbor first."
}

standalone_compose() {
  local args=(--env-file "$ENV_FILE" -f "$STANDALONE_COMPOSE_FILE")
  [ "$(get_env MAILFLOW_TLS_MODE)" != "custom" ] || args+=(-f "$TLS_COMPOSE_FILE")
  docker compose "${args[@]}" "$@"
}

baseharbor_env() {
  ensure_baseharbor
  baha app env --format shell --reveal
}

cmd_install() {
  if [ "$RUNTIME_MODE" = "standalone" ]; then
    MAILFLOW_INSTALL_REF="${MAILFLOW_INSTALL_REF:-$(current_branch)}" exec bash "$ROOT/scripts/install-core.sh" "${MAILFLOW_INSTALL_REF:-$(current_branch)}"
  fi
  exec bash "$ROOT/scripts/install-baseharbor.sh"
}

cmd_start() {
  if [ "$RUNTIME_MODE" = "standalone" ]; then
    ensure_checkout
    [ -f "$ENV_FILE" ] || fail ".env is required for standalone mode."
    standalone_compose up -d --build
    return
  fi
  ensure_baseharbor
  baha app apply
}

cmd_stop() {
  if [ "$RUNTIME_MODE" = "standalone" ]; then
    ensure_checkout
    standalone_compose down
    return
  fi
  ensure_baseharbor
  baha app down
}

cmd_restart() {
  if [ "$RUNTIME_MODE" = "standalone" ]; then
    cmd_stop
    cmd_start
    return
  fi
  ensure_baseharbor
  baha app down
  baha app up
}

cmd_status() {
  ensure_checkout
  printf 'MailFlow\n'
  printf '  Install: %s\n' "$ROOT"
  printf '  Ref: %s\n' "$(current_branch)"
  printf '  Version: %s\n' "$(current_version)"
  printf '  Runtime: %s\n' "$RUNTIME_MODE"
  printf '  URL: %s\n\n' "${MAILFLOW_PUBLIC_URL:-$(get_env MAILFLOW_PUBLIC_URL)}"
  if [ "$RUNTIME_MODE" = "standalone" ]; then
    standalone_compose ps
  else
    ensure_baseharbor
    baha app status
  fi
}

cmd_doctor() {
  if [ "$RUNTIME_MODE" = "standalone" ]; then
    ensure_checkout
    standalone_compose config >/dev/null
    standalone_compose ps
    return
  fi
  ensure_baseharbor
  baha app doctor
}

attachment_volume() {
  local project="baseharbor-workload-mailflow-production" cid
  cid="$(docker ps -a --filter "label=com.docker.compose.project=$project" --filter 'label=com.docker.compose.service=worker' -q | head -1)"
  [ -n "$cid" ] || cid="$(docker ps -a --filter "label=com.docker.compose.project=$project" --filter 'label=com.docker.compose.service=api' -q | head -1)"
  [ -n "$cid" ] || return 0
  docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data/attachments"}}{{.Name}}{{end}}{{end}}' "$cid" 2>/dev/null || true
}

cmd_backup() {
  local stamp dir database_url volume
  if [ "$RUNTIME_MODE" = "standalone" ]; then
    fail "Standalone backup remains available through the legacy standalone tooling; BaseHarbor mode is the default."
  fi
  ensure_baseharbor
  need gzip "gzip is required."
  stamp="$(date '+%Y%m%d-%H%M%S')"
  dir="$BACKUP_ROOT/$stamp"
  mkdir -p "$dir"
  chmod 700 "$ROOT/.mailflow" "$BACKUP_ROOT" "$dir" 2>/dev/null || true
  eval "$(baseharbor_env)"
  database_url="${DATABASE_URL:-}"
  [ -n "$database_url" ] || fail "BaseHarbor did not provide DATABASE_URL."
  say "Creating MailFlow backup"
  docker run --rm --network host -e DATABASE_URL="$database_url" postgres:17-alpine sh -c 'pg_dump "$DATABASE_URL" --no-owner --no-privileges' | gzip -9 > "$dir/database.sql.gz"
  chmod 600 "$dir/database.sql.gz"
  [ ! -f "$ENV_FILE" ] || { cp "$ENV_FILE" "$dir/env"; chmod 600 "$dir/env"; }
  git -C "$ROOT" rev-parse HEAD > "$dir/git-commit"
  volume="$(attachment_volume)"
  if [ -n "$volume" ]; then
    docker run --rm -v "$volume:/source:ro" caddy:2-alpine sh -c 'tar -C /source -czf - .' > "$dir/attachments.tar.gz"
    chmod 600 "$dir/attachments.tar.gz"
  fi
  printf 'Backup: %s\n' "$dir"
}

cmd_restore() {
  local dir="${1:-}" database_url volume
  [ "$RUNTIME_MODE" != "standalone" ] || fail "Use the standalone restore path when MAILFLOW_RUNTIME=standalone."
  [ -n "$dir" ] || fail "Usage: ./mailflow restore <backup-directory> [--yes]"
  [ -f "$dir/database.sql.gz" ] || fail "Backup is missing database.sql.gz"
  if [ "${2:-}" != "--yes" ] && [ "${MAILFLOW_ASSUME_YES:-0}" != "1" ]; then
    printf 'This replaces the current MailFlow database. Continue? [y/N]: '
    read -r answer
    case "${answer,,}" in y|yes|j|ja) ;; *) fail "Restore cancelled." ;; esac
  fi
  ensure_baseharbor
  eval "$(baseharbor_env)"
  database_url="${DATABASE_URL:-}"
  [ -n "$database_url" ] || fail "BaseHarbor did not provide DATABASE_URL."
  baha app down
  docker run --rm --network host -e DATABASE_URL="$database_url" postgres:17-alpine sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
  gzip -dc "$dir/database.sql.gz" | docker run --rm -i --network host -e DATABASE_URL="$database_url" postgres:17-alpine sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1'
  baha app up
  if [ -f "$dir/attachments.tar.gz" ]; then
    volume="$(attachment_volume)"
    if [ -n "$volume" ]; then
      docker run --rm -v "$volume:/target" caddy:2-alpine sh -c 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} +'
      docker run --rm -i -v "$volume:/target" caddy:2-alpine sh -c 'tar -C /target -xzf -' < "$dir/attachments.tar.gz"
    fi
  fi
  baha app doctor
}

cmd_update() {
  local branch current target backup_dir=""
  ensure_checkout
  branch="$(current_branch)"
  current="$(git -C "$ROOT" rev-parse HEAD)"
  git -C "$ROOT" diff --quiet && git -C "$ROOT" diff --cached --quiet || fail "Tracked local changes exist. Commit or revert them before updating."
  git -C "$ROOT" fetch origin "+refs/heads/$branch:refs/remotes/origin/$branch"
  target="$(git -C "$ROOT" rev-parse "origin/$branch")"
  if [ "$current" = "$target" ]; then
    printf 'MailFlow is already up to date (%s).\n' "$(current_version)"
    cmd_doctor
    return
  fi
  git -C "$ROOT" merge-base --is-ancestor "$current" "$target" || fail "Remote update is not a fast-forward."
  if [ "$RUNTIME_MODE" != "standalone" ]; then
    cmd_backup
    backup_dir="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)"
  fi
  git -C "$ROOT" merge --ff-only "origin/$branch"
  if cmd_start && cmd_doctor; then
    printf '\nUpdate completed successfully.\n'
    [ -z "$backup_dir" ] || printf 'Backup retained at: %s\n' "$backup_dir"
    return
  fi
  printf '\nUpdate failed. Rolling code back...\n' >&2
  git -C "$ROOT" reset --hard "$current"
  cmd_start || true
  fail "Update failed; previous code was restored."
}

usage() {
  cat <<'EOF'
MailFlow lifecycle CLI

BaseHarbor is the default self-host runtime. The familiar MailFlow commands stay
stable while infrastructure operations are delegated to baha.

Usage:
  ./mailflow install
  ./mailflow start
  ./mailflow stop
  ./mailflow restart
  ./mailflow status
  ./mailflow doctor
  ./mailflow update
  ./mailflow backup
  ./mailflow restore <backup-directory> [--yes]

Equivalent BaseHarbor operations:
  start    -> baha app apply
  stop     -> baha app down
  restart  -> baha app down && baha app up
  status   -> baha app status
  doctor   -> baha app doctor

Standalone compatibility is explicit:
  MAILFLOW_RUNTIME=standalone ./mailflow start

The standalone runtime uses infrastructure/docker-compose.standalone.yml.
EOF
}

command_name="${1:-help}"
shift || true
case "$command_name" in
  install) cmd_install "$@" ;;
  start|up) cmd_start "$@" ;;
  stop|down) cmd_stop "$@" ;;
  restart) cmd_restart "$@" ;;
  update) cmd_update "$@" ;;
  status) cmd_status "$@" ;;
  doctor) cmd_doctor "$@" ;;
  backup) cmd_backup "$@" ;;
  restore) cmd_restore "$@" ;;
  help|-h|--help) usage ;;
  *) usage; fail "Unknown command: $command_name" ;;
esac
