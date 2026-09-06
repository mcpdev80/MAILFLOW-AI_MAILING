#!/usr/bin/env bash
set -euo pipefail

BRANCH="feat/mvp-guidelines-figma-redesign"
INSTALL_DIR="${1:-$HOME/mailflow}"
COMPOSE_FILE="infrastructure/docker-compose.yml"
TLS_COMPOSE_FILE="infrastructure/docker-compose.custom-tls.yml"

fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
show_diagnostics() {
  printf '\n==> Mailflow diagnostics\n'
  docker compose "${COMPOSE_ARGS[@]}" ps || true
  for service in api worker web edge; do
    printf '\n--- %s logs ---\n' "$service"
    docker compose "${COMPOSE_ARGS[@]}" logs --tail 120 "$service" 2>/dev/null || true
  done
}

[ -d "$INSTALL_DIR/.git" ] || fail "No existing Mailflow checkout found at $INSTALL_DIR"
[ -f "$INSTALL_DIR/.env" ] || fail "Existing installation has no .env file: $INSTALL_DIR/.env"

cd "$INSTALL_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

ENV_FILE="$INSTALL_DIR/.env"
TLS_MODE="$(awk -F= '$1=="MAILFLOW_TLS_MODE" {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE")"
COMPOSE_ARGS=(--env-file "$ENV_FILE" -f "$COMPOSE_FILE")
[ "$TLS_MODE" != "custom" ] || COMPOSE_ARGS+=(-f "$TLS_COMPOSE_FILE")

docker compose "${COMPOSE_ARGS[@]}" config >/dev/null || fail "Docker Compose configuration is invalid."

echo "==> Continuing existing Mailflow installation in $INSTALL_DIR"
docker compose "${COMPOSE_ARGS[@]}" up -d postgres redis

docker compose "${COMPOSE_ARGS[@]}" --profile migrate run --rm web-migrate

if ! docker compose "${COMPOSE_ARGS[@]}" up -d --build; then
  show_diagnostics
  fail "Mailflow failed to start. Diagnostics are shown above."
fi

ready=0
for _ in $(seq 1 30); do
  if docker compose "${COMPOSE_ARGS[@]}" exec -T api python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status == 200 else 1)" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done

if [ "$ready" -ne 1 ]; then
  show_diagnostics
  fail "Mailflow started, but the API did not become healthy."
fi

echo "==> Existing Mailflow installation is healthy."
