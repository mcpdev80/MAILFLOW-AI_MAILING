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

public_host() {
  local url="$1" host
  host="${url#*://}"
  host="${host%%/*}"
  host="${host%%:*}"
  printf '%s' "$host"
}

validate_custom_tls() {
  local cert="$1" key="$2" host="$3" cert_pub key_pub

  [ -r "$cert" ] || fail "Certificate file is not readable: $cert"
  [ -r "$key" ] || fail "Private-key file is not readable: $key"

  openssl x509 -in "$cert" -noout >/dev/null 2>&1 || fail "Certificate is not a valid PEM X.509 certificate: $cert"
  openssl pkey -in "$key" -noout >/dev/null 2>&1 || fail "Private key is not a valid or readable PEM private key: $key"
  openssl x509 -in "$cert" -checkend 0 -noout >/dev/null 2>&1 || fail "Certificate is expired or not yet valid: $cert"

  cert_pub="$(openssl x509 -in "$cert" -pubkey -noout | openssl pkey -pubin -outform DER 2>/dev/null | openssl dgst -sha256 | awk '{print $NF}')"
  key_pub="$(openssl pkey -in "$key" -pubout -outform DER 2>/dev/null | openssl dgst -sha256 | awk '{print $NF}')"
  [ -n "$cert_pub" ] && [ "$cert_pub" = "$key_pub" ] || fail "Certificate and private key do not match."

  if [ -n "$host" ] && [ "$host" != "localhost" ]; then
    openssl x509 -in "$cert" -noout -checkhost "$host" >/dev/null 2>&1 || fail "Certificate is not valid for host: $host"
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
HOST="$(public_host "$PUBLIC_URL")"
TLS_MODE="$(choose_tls)"

case "$TLS_MODE" in
  1)
    TLS_MODE="automatic"
    ;;
  2)
    TLS_MODE="custom"
    TLS_CERT_FILE="$(prompt "Certificate/full-chain file" "/etc/ssl/mailflow/fullchain.pem")"
    TLS_KEY_FILE="$(prompt "Private-key file" "/etc/ssl/mailflow/privkey.pem")"
    say "Validating custom TLS certificate"
    validate_custom_tls "$TLS_CERT_FILE" "$TLS_KEY_FILE" "$HOST"
    printf '%s\n' "TLS certificate: valid, current, host-matched, and key-matched."
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

set_env BETTER_AUTH_URL "$PUBLIC_URL" .env
set_env NEXT_PUBLIC_APP_URL "$PUBLIC_URL" .env
set_env PASSKEY_RP_ID "$HOST" .env
set_env PASSKEY_ORIGIN "$PUBLIC_URL" .env
set_env CORS_ORIGINS "$PUBLIC_URL" .env

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
  if [ "$TLS_MODE" = "custom" ]; then
    say "Verifying HTTPS with the configured certificate"
    curl -fsS --resolve "$HOST:443:127.0.0.1" "$PUBLIC_URL" >/dev/null 2>&1 || fail "Mailflow is running, but HTTPS verification with the configured certificate failed. Check the certificate chain, hostname and edge logs."
  fi

  printf '\nMailflow is ready.\n\nOpen: %s\n\n' "$PUBLIC_URL"
  if [ "$TLS_MODE" = "automatic" ]; then
    printf '%s\n' "TLS: automatic certificate management enabled."
  else
    printf '%s\n' "TLS: custom certificate validated and HTTPS verified."
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
