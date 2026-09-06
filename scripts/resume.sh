#!/usr/bin/env bash
set -euo pipefail

BRANCH="feat/mvp-guidelines-figma-redesign"
INSTALL_DIR="${1:-$HOME/mailflow}"
COMPOSE_FILE="infrastructure/docker-compose.yml"
TLS_COMPOSE_FILE="infrastructure/docker-compose.custom-tls.yml"
TEARDOWN_URL="https://raw.githubusercontent.com/mcpdev80/MAILFLOW-AI_MAILING/${BRANCH}/scripts/teardown.sh"

fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
show_diagnostics() {
  printf '\n==> Mailflow diagnostics\n'
  docker compose "${COMPOSE_ARGS[@]}" ps || true
  for service in api worker web edge; do
    printf '\n--- %s logs ---\n' "$service"
    docker compose "${COMPOSE_ARGS[@]}" logs --tail 120 "$service" 2>/dev/null || true
  done
}
get_env() {
  awk -F= -v k="$1" '$1==k {sub(/^[^=]*=/, ""); print; exit}' "$2"
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
show_success() {
  local language public_url
  language="$(get_env MAILFLOW_BOOTSTRAP_LANGUAGE "$ENV_FILE")"
  public_url="$(get_env MAILFLOW_PUBLIC_URL "$ENV_FILE")"
  [ -n "$public_url" ] || public_url="https://localhost"

  case "$language" in
    de)
      printf '\n========================================\n'
      printf '  Mailflow ist bereit!\n'
      printf '========================================\n\n'
      printf 'Öffnen:\n  %s\n\n' "$public_url"
      printf 'Als Nächstes:\n'
      printf '  1. Öffne den Link im Browser.\n'
      printf '  2. Melde dich an bzw. lege beim ersten Start deinen Benutzer an.\n'
      printf '  3. Fahre anschließend mit der Einrichtung direkt in Mailflow fort.\n\n'
      printf 'Installation:\n  %s\n\n' "$INSTALL_DIR"
      printf 'Komplett zurücksetzen:\n  bash <(curl -fsSL %s)\n\n' "$TEARDOWN_URL"
      ;;
    es)
      printf '\n========================================\n'
      printf '  Mailflow está listo!\n'
      printf '========================================\n\n'
      printf 'Abrir:\n  %s\n\n' "$public_url"
      printf 'Siguiente:\n'
      printf '  1. Abre el enlace en el navegador.\n'
      printf '  2. Inicia sesión o crea tu primer usuario.\n'
      printf '  3. Continúa la configuración directamente en Mailflow.\n\n'
      printf 'Instalación:\n  %s\n\n' "$INSTALL_DIR"
      printf 'Restablecer completamente:\n  bash <(curl -fsSL %s)\n\n' "$TEARDOWN_URL"
      ;;
    *)
      printf '\n========================================\n'
      printf '  Mailflow is ready!\n'
      printf '========================================\n\n'
      printf 'Open:\n  %s\n\n' "$public_url"
      printf 'Next:\n'
      printf '  1. Open the link in your browser.\n'
      printf '  2. Sign in or create your first user.\n'
      printf '  3. Continue setup directly in Mailflow.\n\n'
      printf 'Installation:\n  %s\n\n' "$INSTALL_DIR"
      printf 'Full reset:\n  bash <(curl -fsSL %s)\n\n' "$TEARDOWN_URL"
      ;;
  esac
}

[ -d "$INSTALL_DIR/.git" ] || fail "No existing Mailflow checkout found at $INSTALL_DIR"
[ -f "$INSTALL_DIR/.env" ] || fail "Existing installation has no .env file: $INSTALL_DIR/.env"

cd "$INSTALL_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

ENV_FILE="$INSTALL_DIR/.env"
TLS_MODE="$(get_env MAILFLOW_TLS_MODE "$ENV_FILE")"
PUBLIC_URL="$(get_env MAILFLOW_PUBLIC_URL "$ENV_FILE")"
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
  api_ok=0
  worker_ok=0
  web_ok=0
  edge_ok=0

  if docker compose "${COMPOSE_ARGS[@]}" exec -T api python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status == 200 else 1)" >/dev/null 2>&1; then
    api_ok=1
  fi

  if [ "$(docker inspect -f '{{.State.Status}}' infrastructure-worker-1 2>/dev/null || true)" = "running" ]; then
    sleep 1
    if [ "$(docker inspect -f '{{.State.Status}}' infrastructure-worker-1 2>/dev/null || true)" = "running" ]; then
      worker_ok=1
    fi
  fi

  if docker compose "${COMPOSE_ARGS[@]}" exec -T edge wget -q -O /dev/null -T 5 http://web:3000/ >/dev/null 2>&1; then
    web_ok=1
  fi

  if [ -n "$PUBLIC_URL" ]; then
    host="$(public_host "$PUBLIC_URL")"
    port="$(public_port "$PUBLIC_URL")"
    if [ "$TLS_MODE" = "custom" ]; then
      curl -fsS --connect-timeout 5 --resolve "$host:$port:127.0.0.1" "$PUBLIC_URL" >/dev/null 2>&1 && edge_ok=1
    else
      curl -kfsS --connect-timeout 5 --resolve "$host:$port:127.0.0.1" "$PUBLIC_URL" >/dev/null 2>&1 && edge_ok=1
    fi
  fi

  if [ "$api_ok" -eq 1 ] && [ "$worker_ok" -eq 1 ] && [ "$web_ok" -eq 1 ] && [ "$edge_ok" -eq 1 ]; then
    ready=1
    break
  fi
  sleep 2
done

if [ "$ready" -ne 1 ]; then
  show_diagnostics
  fail "Mailflow started, but the complete stack did not become healthy."
fi

show_success
