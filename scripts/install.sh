#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/mcpdev80/MAILFLOW-AI_MAILING.git"
BRANCH="feat/mvp-guidelines-figma-redesign"
INSTALL_DIR_DEFAULT="$HOME/mailflow"
COMPOSE_FILE="infrastructure/docker-compose.yml"

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

say "Starting database"
docker compose -f "$COMPOSE_FILE" up -d postgres

say "Preparing web authentication schema"
docker compose -f "$COMPOSE_FILE" --profile migrate run --rm web-migrate

say "Building and starting Mailflow"
docker compose -f "$COMPOSE_FILE" up -d --build

say "Waiting for the stack to become ready"
ready=0
for _ in $(seq 1 30); do
  if curl -kfsS "$PUBLIC_URL/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done

if [ "$ready" -eq 1 ]; then
  printf '\nMailflow is ready.\n\nOpen: %s\n\n' "$PUBLIC_URL"
  printf '%s\n' "Next: create your first user in the browser and continue with the in-app onboarding."
else
  printf '\nMailflow started, but the health check is not ready yet.\n\n'
  printf '%s\n' "Run this to inspect the services:"
  printf '  cd %q && docker compose -f %q ps\n' "$INSTALL_DIR" "$COMPOSE_FILE"
  printf '%s\n' "And this for logs:"
  printf '  cd %q && docker compose -f %q logs --tail=100 api web worker edge\n' "$INSTALL_DIR" "$COMPOSE_FILE"
  exit 1
fi
