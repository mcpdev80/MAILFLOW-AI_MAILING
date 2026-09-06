#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/mcpdev80/MAILFLOW-AI_MAILING.git"
BRANCH="feat/mvp-guidelines-figma-redesign"
INSTALL_DIR_DEFAULT="$HOME/mailflow"
COMPOSE_FILE="infrastructure/docker-compose.yml"
TLS_COMPOSE_FILE="infrastructure/docker-compose.custom-tls.yml"

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "$2"; }

prompt() {
  local label="$1" default="$2" value
  if [ -r /dev/tty ]; then
    printf '%s [%s]: ' "$label" "$default" > /dev/tty
    IFS= read -r value < /dev/tty || true
  else
    value=""
  fi
  printf '%s' "${value:-$default}"
}

choose_tls() {
  local value
  if [ -r /dev/tty ]; then
    printf '\nTLS certificate:\n' > /dev/tty
    printf '  1) Automatic (recommended: Caddy manages local/public certificates)\n' > /dev/tty
    printf '  2) Use my own certificate and private key\n' > /dev/tty
    printf 'Choice [1]: ' > /dev/tty
    IFS= read -r value < /dev/tty || true
  else
    value="1"
  fi
  printf '%s' "${value:-1}"
}

secret_hex() {
  openssl rand -hex 32
}

secret_fernet() {
  openssl rand -base64 32 | tr '+/' '-_' | tr -d '\n'
}

set_env() {
  local key="$1" value="$2" file="$3"
  if grep -q "^${key}=" "$file"; then
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

say "Mailflow guided installer"
printf '%s\n' "As little as possible, as much as necessary."

need git "git is required. Please install git and run this command again."
need openssl "openssl is required. Please install openssl and run this command again."
need docker "Docker is required. Install Docker Engine/Desktop first, then run this command again."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required (docker compose)."
docker info >/dev/null 2>&1 || fail "Docker is installed but not reachable. Start Docker or fix your Docker permissions."

INSTALL_DIR="$(prompt "Install directory" "$INSTALL_DIR_DEFAULT")"
PUBLIC_URL="$(prompt "Public URL for this installation" "https://localhost")"
TLS_MODE="$(choose_tls)"

case "$TLS_MODE" in
  1)
    TLS_MODE="automatic"
    ;;
  2)
    TLS_MODE="custom"
    TLS_CERT_FILE="$(prompt "Certificate/full-chain file" "/etc/ssl/mailflow/fullchain.pem")"
    TLS_KEY_FILE="$(prompt "Private-key file" "/etc/ssl/mailflow/privkey.pem")"
    [ -r "$TLS_CERT_FILE" ] || fail "Certificate file is not readable: $TLS_CERT_FILE"
    [ -r "$TLS_KEY_FILE" ] || fail "Private-key file is not readable: $TLS_KEY_FILE"
    ;;
  *)
    fail "Invalid TLS choice. Use 1 or 2."
    ;;
esac

if [ -d "$INSTALL_DIR/.git" ]; then
  say "Updating existing checkout in $INSTALL_DIR"
  git -C "$INSTALL_DIR" fetch origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
elif [ -e "$INSTALL_DIR" ]; then
  fail "$INSTALL_DIR already exists but is not a Mailflow git checkout."
else
  say "Cloning Mailflow into $INSTALL_DIR"
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  say "Creating secure local configuration"
  set_env SECRET_KEY "$(secret_fernet)" .env
  set_env BETTER_AUTH_SECRET "$(secret_hex)" .env
  set_env WEB_SECRET_KEY "$(secret_hex)" .env
  set_env INTERNAL_API_SECRET "$(secret_hex)" .env
  set_env POSTGRES_PASSWORD "$(secret_hex)" .env
else
  say "Existing .env found; keeping your current secrets and settings"
fi

set_env MAILFLOW_PUBLIC_URL "$PUBLIC_URL" .env
set_env AUTH_MODE "single" .env
set_env WEB_AUTH "on" .env
set_env API_INTERNAL_URL "http://api:8000" .env
set_env API_DOCS_ENABLED "false" .env
set_env WORKER_MAX_EMAILS_PER_CYCLE "10" .env

if [ "$TLS_MODE" = "custom" ]; then
  set_env TLS_CERT_FILE "$TLS_CERT_FILE" .env
  set_env TLS_KEY_FILE "$TLS_KEY_FILE" .env
else
  set_env TLS_CERT_FILE "" .env
  set_env TLS_KEY_FILE "" .env
fi

case "$PUBLIC_URL" in
  https://localhost|http://localhost)
    set_env BETTER_AUTH_URL "$PUBLIC_URL" .env
    set_env NEXT_PUBLIC_APP_URL "$PUBLIC_URL" .env
    set_env PASSKEY_RP_ID "localhost" .env
    set_env PASSKEY_ORIGIN "$PUBLIC_URL" .env
    set_env CORS_ORIGINS "$PUBLIC_URL" .env
    ;;
  *)
    host="${PUBLIC_URL#*://}"
    host="${host%%/*}"
    host="${host%%:*}"
    set_env BETTER_AUTH_URL "$PUBLIC_URL" .env
    set_env NEXT_PUBLIC_APP_URL "$PUBLIC_URL" .env
    set_env PASSKEY_RP_ID "$host" .env
    set_env PASSKEY_ORIGIN "$PUBLIC_URL" .env
    set_env CORS_ORIGINS "$PUBLIC_URL" .env
    ;;
esac

COMPOSE_ARGS=(-f "$COMPOSE_FILE")
if [ "$TLS_MODE" = "custom" ]; then
  COMPOSE_ARGS+=(-f "$TLS_COMPOSE_FILE")
fi

say "Starting database"
docker compose "${COMPOSE_ARGS[@]}" up -d postgres

say "Preparing web authentication schema"
docker compose "${COMPOSE_ARGS[@]}" --profile migrate run --rm web-migrate

say "Building and starting Mailflow"
docker compose "${COMPOSE_ARGS[@]}" up -d --build

say "Waiting for the stack to become ready"
ready=0
for _ in $(seq 1 30); do
  if docker compose "${COMPOSE_ARGS[@]}" exec -T api python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status == 200 else 1)" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done

if [ "$ready" -eq 1 ]; then
  printf '\nMailflow is ready.\n\nOpen: %s\n\n' "$PUBLIC_URL"
  if [ "$TLS_MODE" = "automatic" ]; then
    printf '%s\n' "TLS: automatic certificate management enabled."
  else
    printf '%s\n' "TLS: custom certificate enabled."
  fi
  printf '%s\n' "Next: create your first user in the browser and continue with the in-app onboarding."
else
  printf '\nMailflow started, but the API health check is not ready yet.\n\n'
  printf '%s\n' "Run this to inspect the services:"
  printf '  cd %q && docker compose' "$INSTALL_DIR"
  printf ' -f %q' "$COMPOSE_FILE"
  if [ "$TLS_MODE" = "custom" ]; then printf ' -f %q' "$TLS_COMPOSE_FILE"; fi
  printf ' ps\n'
  printf '%s\n' "And this for logs:"
  printf '  cd %q && docker compose' "$INSTALL_DIR"
  printf ' -f %q' "$COMPOSE_FILE"
  if [ "$TLS_MODE" = "custom" ]; then printf ' -f %q' "$TLS_COMPOSE_FILE"; fi
  printf ' logs --tail=100 api web worker edge\n'
  exit 1
fi
