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

prompt_path() {
  local label="$1" default="$2" value prompt_text
  if [ -r /dev/tty ]; then
    printf -v prompt_text '%s [%s]: ' "$label" "$default"
    IFS= read -e -r -p "$prompt_text" value < /dev/tty || true
  else
    value=""
  fi
  printf '%s' "${value:-$default}"
}

prompt_secret() {
  local label="$1" value
  if [ -r /dev/tty ]; then
    printf '%s: ' "$label" > /dev/tty
    IFS= read -s -r value < /dev/tty || true
    printf '\n' > /dev/tty
  else
    value=""
  fi
  printf '%s' "$value"
}

choose_tls() {
  local value
  if [ -r /dev/tty ]; then
    printf '\nTLS certificate:\n' > /dev/tty
    printf '  1) Automatic (recommended: Caddy manages certificates)\n' > /dev/tty
    printf '  2) Use certificates from a folder\n' > /dev/tty
    printf 'Choice [1]: ' > /dev/tty
    IFS= read -r value < /dev/tty || true
  else
    value="1"
  fi
  printf '%s' "${value:-1}"
}

secret_hex() { openssl rand -hex 32; }
secret_fernet() { openssl rand -base64 32 | tr '+/' '-_' | tr -d '\n'; }

set_env() {
  local key="$1" value="$2" file="$3"
  if grep -q "^${key}=" "$file"; then
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

cert_to_pem() {
  local src="$1" dst="$2"
  if openssl x509 -in "$src" -outform PEM -out "$dst" >/dev/null 2>&1; then
    return 0
  fi
  if openssl x509 -inform DER -in "$src" -outform PEM -out "$dst" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

pubkey_fingerprint_from_key() {
  openssl pkey -in "$1" -pubout 2>/dev/null | openssl sha256 | awk '{print $2}'
}

pubkey_fingerprint_from_cert() {
  openssl x509 -in "$1" -pubkey -noout 2>/dev/null | openssl sha256 | awk '{print $2}'
}

is_self_signed() {
  local cert="$1" subject issuer
  subject="$(openssl x509 -in "$cert" -noout -subject -nameopt RFC2253 | sed 's/^subject=//')"
  issuer="$(openssl x509 -in "$cert" -noout -issuer -nameopt RFC2253 | sed 's/^issuer=//')"
  [ "$subject" = "$issuer" ]
}

assemble_custom_tls() {
  local source_dir="$1" public_url="$2" output_dir="$3"
  local work cert_dir key_file="" p12_file="" p12_password="" host key_fp leaf=""

  [ -d "$source_dir" ] || fail "Certificate folder does not exist: $source_dir"
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' RETURN
  cert_dir="$work/certs"
  mkdir -p "$cert_dir"

  say "Scanning certificate folder"

  while IFS= read -r -d '' file; do
    case "${file,,}" in
      *.zip)
        need unzip "A ZIP certificate bundle was found, but unzip is not installed."
        unzip -qq -o "$file" -d "$work/unpacked-$(basename "$file" .zip)" || fail "Could not unpack: $file"
        ;;
    esac
  done < <(find "$source_dir" -maxdepth 2 -type f -print0)

  while IFS= read -r -d '' file; do
    case "${file,,}" in
      *.key)
        if openssl pkey -in "$file" -noout >/dev/null 2>&1; then
          key_file="$file"
          break
        fi
        ;;
    esac
  done < <(find "$source_dir" "$work" -type f -print0)

  if [ -z "$key_file" ]; then
    while IFS= read -r -d '' file; do
      case "${file,,}" in
        *.p12|*.pfx) p12_file="$file"; break ;;
      esac
    done < <(find "$source_dir" "$work" -type f -print0)
    if [ -n "$p12_file" ]; then
      p12_password="$(prompt_secret "PKCS#12 password (leave empty if none)")"
      if openssl pkcs12 -in "$p12_file" -nocerts -nodes -passin "pass:$p12_password" -out "$work/from-p12.key" >/dev/null 2>&1; then
        key_file="$work/from-p12.key"
        openssl pkcs12 -in "$p12_file" -clcerts -nokeys -passin "pass:$p12_password" -out "$work/from-p12-leaf.pem" >/dev/null 2>&1 || true
        openssl pkcs12 -in "$p12_file" -cacerts -nokeys -passin "pass:$p12_password" -out "$work/from-p12-chain.pem" >/dev/null 2>&1 || true
      else
        fail "Could not read the PKCS#12/PFX file with that password."
      fi
    fi
  fi

  [ -n "$key_file" ] || fail "No usable private key found (.key, .p12 or .pfx)."
  openssl pkey -in "$key_file" -noout >/dev/null 2>&1 || fail "Private key is not usable."

  local n=0
  while IFS= read -r -d '' file; do
    case "${file,,}" in
      *.cer|*.crt|*.pem)
        n=$((n+1))
        cert_to_pem "$file" "$cert_dir/cert-$n.pem" || rm -f "$cert_dir/cert-$n.pem"
        ;;
      *.p7b|*.p7c)
        n=$((n+1))
        if ! openssl pkcs7 -print_certs -in "$file" -out "$work/p7-$n.pem" >/dev/null 2>&1; then
          openssl pkcs7 -inform DER -print_certs -in "$file" -out "$work/p7-$n.pem" >/dev/null 2>&1 || true
        fi
        ;;
    esac
  done < <(find "$source_dir" "$work" -type f -print0)

  if [ -f "$work/from-p12-leaf.pem" ]; then cp "$work/from-p12-leaf.pem" "$cert_dir/from-p12-leaf.pem"; fi
  if [ -f "$work/from-p12-chain.pem" ]; then cp "$work/from-p12-chain.pem" "$cert_dir/from-p12-chain.pem"; fi

  for bundle in "$work"/p7-*.pem "$cert_dir"/from-p12-chain.pem; do
    [ -f "$bundle" ] || continue
    awk -v dir="$cert_dir" 'BEGIN{n=0; out=""} /-----BEGIN CERTIFICATE-----/{n++; out=dir "/split-" n "-" systime() ".pem"} out!=""{print >> out} /-----END CERTIFICATE-----/{close(out); out=""}' "$bundle"
  done

  key_fp="$(pubkey_fingerprint_from_key "$key_file")"
  while IFS= read -r cert; do
    openssl x509 -in "$cert" -noout >/dev/null 2>&1 || continue
    if [ "$(pubkey_fingerprint_from_cert "$cert")" = "$key_fp" ]; then
      leaf="$cert"
      break
    fi
  done < <(find "$cert_dir" -type f -name '*.pem' -print)

  [ -n "$leaf" ] || fail "No certificate matching the private key was found."
  openssl x509 -in "$leaf" -checkend 0 -noout >/dev/null 2>&1 || fail "The server certificate is expired or not yet valid."

  host="${public_url#*://}"
  host="${host%%/*}"
  host="${host%%:*}"
  if [ -n "$host" ] && [ "$host" != "localhost" ]; then
    openssl x509 -in "$leaf" -noout -checkhost "$host" >/dev/null 2>&1 || fail "Certificate does not match host: $host"
  fi

  mkdir -p "$output_dir"
  cp "$key_file" "$output_dir/privkey.pem"
  chmod 600 "$output_dir/privkey.pem"
  cp "$leaf" "$output_dir/fullchain.pem"

  local current="$leaf" current_issuer candidate candidate_subject added=0
  while :; do
    current_issuer="$(openssl x509 -in "$current" -noout -issuer -nameopt RFC2253 | sed 's/^issuer=//')"
    candidate=""
    while IFS= read -r cert; do
      [ "$cert" = "$leaf" ] && continue
      candidate_subject="$(openssl x509 -in "$cert" -noout -subject -nameopt RFC2253 2>/dev/null | sed 's/^subject=//')"
      if [ "$candidate_subject" = "$current_issuer" ]; then
        candidate="$cert"
        break
      fi
    done < <(find "$cert_dir" -type f -name '*.pem' -print)
    [ -n "$candidate" ] || break
    if is_self_signed "$candidate"; then
      break
    fi
    cat "$candidate" >> "$output_dir/fullchain.pem"
    current="$candidate"
    added=$((added+1))
    [ "$added" -lt 8 ] || break
  done

  openssl x509 -in "$output_dir/fullchain.pem" -noout >/dev/null 2>&1 || fail "Generated fullchain.pem is invalid."
  [ "$(pubkey_fingerprint_from_key "$output_dir/privkey.pem")" = "$(pubkey_fingerprint_from_cert "$leaf")" ] || fail "Generated certificate and key do not match."

  TLS_CERT_FILE="$output_dir/fullchain.pem"
  TLS_KEY_FILE="$output_dir/privkey.pem"
  printf '\nDetected and prepared TLS files:\n'
  printf '  Certificate: %s\n' "$(openssl x509 -in "$leaf" -noout -subject | sed 's/^subject=//')"
  printf '  Expires:     %s\n' "$(openssl x509 -in "$leaf" -noout -enddate | cut -d= -f2-)"
  printf '  Full chain:  %s\n' "$TLS_CERT_FILE"
  printf '  Private key: %s\n' "$TLS_KEY_FILE"
}

say "Mailflow guided installer"
printf '%s\n' "As little as possible, as much as necessary."

need git "git is required. Please install git and run this command again."
need openssl "openssl is required. Please install openssl and run this command again."
need docker "Docker is required. Install Docker Engine/Desktop first, then run this command again."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required (docker compose)."
docker info >/dev/null 2>&1 || fail "Docker is installed but not reachable. Start Docker or fix your Docker permissions."

INSTALL_DIR="$(prompt_path "Install directory" "$INSTALL_DIR_DEFAULT")"
PUBLIC_URL="$(prompt "Public URL for this installation" "https://localhost")"
TLS_MODE="$(choose_tls)"
TLS_SOURCE_DIR=""

case "$TLS_MODE" in
  1) TLS_MODE="automatic" ;;
  2)
    TLS_MODE="custom"
    TLS_SOURCE_DIR="$(prompt_path "Certificate folder" "$HOME")"
    ;;
  *) fail "Invalid TLS choice. Use 1 or 2." ;;
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
  assemble_custom_tls "$TLS_SOURCE_DIR" "$PUBLIC_URL" "$INSTALL_DIR/.mailflow/tls"
  set_env TLS_CERT_FILE "$TLS_CERT_FILE" .env
  set_env TLS_KEY_FILE "$TLS_KEY_FILE" .env
else
  set_env TLS_CERT_FILE "" .env
  set_env TLS_KEY_FILE "" .env
fi

host="${PUBLIC_URL#*://}"
host="${host%%/*}"
host="${host%%:*}"
set_env BETTER_AUTH_URL "$PUBLIC_URL" .env
set_env NEXT_PUBLIC_APP_URL "$PUBLIC_URL" .env
set_env PASSKEY_RP_ID "${host:-localhost}" .env
set_env PASSKEY_ORIGIN "$PUBLIC_URL" .env
set_env CORS_ORIGINS "$PUBLIC_URL" .env

COMPOSE_ARGS=(-f "$COMPOSE_FILE")
if [ "$TLS_MODE" = "custom" ]; then COMPOSE_ARGS+=(-f "$TLS_COMPOSE_FILE"); fi

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
[ "$ready" -eq 1 ] || fail "Mailflow started, but the API health check did not become ready."

if [[ "$PUBLIC_URL" == https://* ]]; then
  if [ "$TLS_MODE" = "custom" ]; then
    curl -fsS --connect-timeout 10 "$PUBLIC_URL" >/dev/null || fail "Mailflow is running, but HTTPS verification failed for $PUBLIC_URL"
  else
    curl -kfsS --connect-timeout 10 "$PUBLIC_URL" >/dev/null || fail "Mailflow is running, but HTTPS is not reachable at $PUBLIC_URL"
  fi
fi

printf '\nMailflow is ready.\n\nOpen: %s\n\n' "$PUBLIC_URL"
if [ "$TLS_MODE" = "automatic" ]; then
  printf '%s\n' "TLS: automatic certificate management enabled."
else
  printf '%s\n' "TLS: certificate bundle auto-detected, assembled, validated and HTTPS verified."
fi
printf '%s\n' "Next: create your first user in the browser and continue with the in-app onboarding."
