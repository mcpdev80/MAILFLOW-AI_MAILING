#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/mcpdev80/MAILFLOW-AI_MAILING.git"
BRANCH="feat/mvp-guidelines-figma-redesign"
INSTALL_DIR_DEFAULT="$HOME/mailflow"
COMPOSE_FILE="infrastructure/docker-compose.yml"
TLS_COMPOSE_FILE="infrastructure/docker-compose.custom-tls.yml"

detect_system_language() {
  local locale="${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}"
  locale="${locale,,}"
  case "$locale" in
    de*|*de_de*) printf 'de' ;;
    es*|*es_es*) printf 'es' ;;
    *) printf 'en' ;;
  esac
}

INSTALL_LANGUAGE="$(detect_system_language)"

msg() {
  local key="$1"
  case "$INSTALL_LANGUAGE:$key" in
    de:title) printf 'Geführte Mailflow-Installation' ;;
    de:motto) printf 'So wenig wie möglich, so viel wie nötig.' ;;
    de:install_dir) printf 'Installationsverzeichnis' ;;
    de:tls_title) printf 'TLS-Zertifikat:' ;;
    de:tls_auto) printf 'Automatisch (empfohlen: Caddy verwaltet Zertifikate)' ;;
    de:tls_custom) printf 'Vorhandene Zertifikate aus einem Ordner verwenden' ;;
    de:choice) printf 'Auswahl' ;;
    de:cert_dir) printf 'Zertifikatsordner' ;;
    de:analyze_cert) printf 'Zertifikatspaket wird analysiert' ;;
    de:cert_detected) printf 'Zertifikat erkannt:' ;;
    de:names) printf 'Namen' ;;
    de:expires) printf 'Gültig bis' ;;
    de:private_key) printf 'Privater Schlüssel' ;;
    de:chain) printf 'Zertifikatskette' ;;
    de:hostname) printf 'Hostname' ;;
    de:invalid_hostname) printf 'Ungültiger Hostname. Verwende genau einen DNS-Namensteil, z. B. mail oder mailflow.' ;;
    de:not_covered) printf 'wird vom Zertifikat nicht abgedeckt.' ;;
    de:validated) printf 'Geprüfte Konfiguration:' ;;
    de:public_url) printf 'Öffentliche URL' ;;
    de:language) printf 'Sprache' ;;
    de:cert_folder) printf 'Zertifikatsordner' ;;
    de:http_port) printf 'HTTP-Port' ;;
    de:https_port) printf 'HTTPS-Port' ;;
    de:port_busy) printf 'Port %s ist belegt; verwende stattdessen Port %s.' ;;
    de:updating) printf 'Vorhandene Installation wird aktualisiert in' ;;
    de:cloning) printf 'Mailflow wird geklont nach' ;;
    de:create_config) printf 'Sichere lokale Konfiguration wird erstellt' ;;
    de:check_config) printf 'Vorhandene lokale Konfiguration wird geprüft' ;;
    de:prepare_tls) printf 'TLS-Dateien werden vorbereitet' ;;
    de:start_db) printf 'Datenbank wird gestartet' ;;
    de:prepare_auth) printf 'Web-Authentifizierungsschema wird vorbereitet' ;;
    de:build_start) printf 'Mailflow wird gebaut und gestartet' ;;
    de:wait_ready) printf 'Warte, bis Mailflow bereit ist' ;;
    de:ready) printf 'Mailflow ist bereit.' ;;
    de:open) printf 'Öffnen' ;;
    de:next) printf 'Als Nächstes: Lege im Browser den ersten Benutzer an und fahre mit der Einrichtung in Mailflow fort.' ;;

    es:title) printf 'Instalación guiada de Mailflow' ;;
    es:motto) printf 'Lo mínimo posible, todo lo necesario.' ;;
    es:install_dir) printf 'Directorio de instalación' ;;
    es:tls_title) printf 'Certificado TLS:' ;;
    es:tls_auto) printf 'Automático (recomendado: Caddy gestiona los certificados)' ;;
    es:tls_custom) printf 'Usar certificados existentes de una carpeta' ;;
    es:choice) printf 'Selección' ;;
    es:cert_dir) printf 'Carpeta de certificados' ;;
    es:analyze_cert) printf 'Analizando paquete de certificados' ;;
    es:cert_detected) printf 'Certificado detectado:' ;;
    es:names) printf 'Nombres' ;;
    es:expires) printf 'Válido hasta' ;;
    es:private_key) printf 'Clave privada' ;;
    es:chain) printf 'Cadena' ;;
    es:hostname) printf 'Nombre de host' ;;
    es:invalid_hostname) printf 'Nombre de host no válido. Usa una sola etiqueta DNS, por ejemplo mail o mailflow.' ;;
    es:not_covered) printf 'no está cubierto por el certificado.' ;;
    es:validated) printf 'Configuración validada:' ;;
    es:public_url) printf 'URL pública' ;;
    es:language) printf 'Idioma' ;;
    es:cert_folder) printf 'Carpeta de certificados' ;;
    es:http_port) printf 'Puerto HTTP' ;;
    es:https_port) printf 'Puerto HTTPS' ;;
    es:port_busy) printf 'El puerto %s está ocupado; se usará el puerto %s.' ;;
    es:updating) printf 'Actualizando instalación existente en' ;;
    es:cloning) printf 'Clonando Mailflow en' ;;
    es:create_config) printf 'Creando configuración local segura' ;;
    es:check_config) printf 'Comprobando configuración local existente' ;;
    es:prepare_tls) printf 'Preparando archivos TLS' ;;
    es:start_db) printf 'Iniciando base de datos' ;;
    es:prepare_auth) printf 'Preparando esquema de autenticación web' ;;
    es:build_start) printf 'Compilando e iniciando Mailflow' ;;
    es:wait_ready) printf 'Esperando a que Mailflow esté listo' ;;
    es:ready) printf 'Mailflow está listo.' ;;
    es:open) printf 'Abrir' ;;
    es:next) printf 'Siguiente: crea el primer usuario en el navegador y continúa con la configuración de Mailflow.' ;;

    *:title) printf 'Mailflow guided installer' ;;
    *:motto) printf 'As little as possible, as much as necessary.' ;;
    *:install_dir) printf 'Install directory' ;;
    *:tls_title) printf 'TLS certificate:' ;;
    *:tls_auto) printf 'Automatic (recommended: Caddy manages certificates)' ;;
    *:tls_custom) printf 'Use certificates from a folder' ;;
    *:choice) printf 'Choice' ;;
    *:cert_dir) printf 'Certificate folder' ;;
    *:analyze_cert) printf 'Analyzing certificate bundle' ;;
    *:cert_detected) printf 'Certificate detected:' ;;
    *:names) printf 'Names' ;;
    *:expires) printf 'Expires' ;;
    *:private_key) printf 'Private key' ;;
    *:chain) printf 'Chain' ;;
    *:hostname) printf 'Hostname' ;;
    *:invalid_hostname) printf 'Invalid hostname. Use one DNS label, for example mail or mailflow.' ;;
    *:not_covered) printf 'is not covered by the certificate.' ;;
    *:validated) printf 'Validated configuration:' ;;
    *:public_url) printf 'Public URL' ;;
    *:language) printf 'Language' ;;
    *:cert_folder) printf 'Certificate folder' ;;
    *:http_port) printf 'HTTP port' ;;
    *:https_port) printf 'HTTPS port' ;;
    *:port_busy) printf 'Port %s is busy; using port %s instead.' ;;
    *:updating) printf 'Updating existing checkout in' ;;
    *:cloning) printf 'Cloning Mailflow into' ;;
    *:create_config) printf 'Creating secure local configuration' ;;
    *:check_config) printf 'Checking existing local configuration' ;;
    *:prepare_tls) printf 'Preparing TLS files' ;;
    *:start_db) printf 'Starting database' ;;
    *:prepare_auth) printf 'Preparing web authentication schema' ;;
    *:build_start) printf 'Building and starting Mailflow' ;;
    *:wait_ready) printf 'Waiting for the stack to become ready' ;;
    *:ready) printf 'Mailflow is ready.' ;;
    *:open) printf 'Open' ;;
    *:next) printf 'Next: create your first user in the browser and continue with the in-app onboarding.' ;;
  esac
}

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "$2"; }

prompt() {
  local label="$1" default="$2" value
  if [ -r /dev/tty ]; then
    IFS= read -r -p "$label [$default]: " value < /dev/tty || true
  else
    value=""
  fi
  printf '%s' "${value:-$default}"
}

prompt_path() {
  local label="$1" default="$2" value
  if [ -r /dev/tty ]; then
    IFS= read -e -r -p "$label [$default]: " value < /dev/tty || true
  else
    value=""
  fi
  printf '%s' "${value:-$default}"
}

prompt_secret() {
  local label="$1" value
  if [ -r /dev/tty ]; then
    IFS= read -s -r -p "$label: " value < /dev/tty || true
    printf '\n' > /dev/tty
  else
    value=""
  fi
  printf '%s' "$value"
}

choose_tls() {
  local value
  if [ -r /dev/tty ]; then
    printf '\n%s\n' "$(msg tls_title)" > /dev/tty
    printf '  1) %s\n' "$(msg tls_auto)" > /dev/tty
    printf '  2) %s\n' "$(msg tls_custom)" > /dev/tty
    IFS= read -r -p "$(msg choice) [1]: " value < /dev/tty || true
  else
    value="1"
  fi
  printf '%s' "${value:-1}"
}

resolve_path() {
  local value="$1" base="$2"
  case "$value" in
    "~") value="$HOME" ;;
    "~/"*) value="$HOME/${value#~/}" ;;
  esac
  [[ "$value" = /* ]] || value="$base/$value"
  if command -v realpath >/dev/null 2>&1; then realpath -m "$value"; else printf '%s' "$value"; fi
}

normalize_public_url() {
  local value="$1" host
  value="${value%/}"
  [[ "$value" = http://* || "$value" = https://* ]] || value="https://$value"
  host="${value#*://}"; host="${host%%/*}"; host="${host%%:*}"
  [ -n "$host" ] || fail "Public URL does not contain a host name."
  [[ "$host" =~ ^[A-Za-z0-9.-]+$ ]] || fail "Public URL contains an invalid host name: $host"
  printf '%s' "$value"
}

validate_install_dir() {
  local dir="$1" parent
  [ ! -e "$dir" ] || [ -d "$dir" ] || fail "Install path exists but is not a directory: $dir"
  if [ -d "$dir" ]; then [ -w "$dir" ] || fail "Install directory is not writable: $dir"; return; fi
  parent="$(dirname "$dir")"
  while [ ! -d "$parent" ] && [ "$parent" != "/" ]; do parent="$(dirname "$parent")"; done
  [ -w "$parent" ] || fail "Cannot create install directory below: $parent"
}

validate_certificate_folder() {
  local dir="$1"
  [ -d "$dir" ] || fail "Certificate folder does not exist: $dir"
  [ -r "$dir" ] || fail "Certificate folder is not readable: $dir"
  find "$dir" -maxdepth 2 -type f \( -iname '*.cer' -o -iname '*.crt' -o -iname '*.pem' -o -iname '*.key' -o -iname '*.zip' -o -iname '*.p7b' -o -iname '*.p7c' -o -iname '*.p12' -o -iname '*.pfx' \) -print -quit | grep -q . || fail "No supported certificate files found in: $dir"
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

get_env() { awk -F= -v k="$1" '$1==k {sub(/^[^=]*=/, ""); print; exit}' "$2"; }

ensure_env_secret() {
  local key="$1" generator="$2" file="$3"
  if [ -z "$(get_env "$key" "$file")" ]; then
    set_env "$key" "$($generator)" "$file"
    printf '  generated %s\n' "$key"
  fi
}

validate_env() {
  [ -n "$(get_env SECRET_KEY "$1")" ] || fail "SECRET_KEY is empty after configuration repair."
  [ -n "$(get_env POSTGRES_PASSWORD "$1")" ] || fail "POSTGRES_PASSWORD is empty after configuration repair."
}

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)$port$" && return 0
    return 1
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk 'NR>2 {print $4}' | grep -Eq "(^|:)$port$" && return 0
    return 1
  fi
  (echo > "/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1
}

find_free_port() {
  local start="$1" port="$1"
  while port_in_use "$port"; do
    port=$((port + 1))
    [ "$port" -le 65535 ] || fail "No free TCP port found starting at $start."
  done
  printf '%s' "$port"
}

choose_edge_ports() {
  local existing_env="$1" saved_http="" saved_https=""
  if [ -f "$existing_env" ]; then
    saved_http="$(get_env HTTP_PORT "$existing_env")"
    saved_https="$(get_env HTTPS_PORT "$existing_env")"
  fi

  if [[ "$saved_http" =~ ^[0-9]+$ ]]; then
    HTTP_PORT="$saved_http"
  else
    HTTP_PORT="$(find_free_port 80)"
    if [ "$HTTP_PORT" != "80" ]; then
      printf "$(msg port_busy)\n" 80 "$HTTP_PORT" > /dev/tty
    fi
  fi

  if [[ "$saved_https" =~ ^[0-9]+$ ]]; then
    HTTPS_PORT="$saved_https"
  else
    HTTPS_PORT="$(find_free_port 443)"
    if [ "$HTTPS_PORT" != "443" ]; then
      printf "$(msg port_busy)\n" 443 "$HTTPS_PORT" > /dev/tty
    fi
  fi
}

public_host() {
  local value="$1" host
  host="${value#*://}"; host="${host%%/*}"; host="${host%%:*}"
  printf '%s' "$host"
}

apply_public_https_port() {
  local base_url="$1" https_port="$2" scheme host
  scheme="${base_url%%://*}"
  host="$(public_host "$base_url")"
  if [ "$https_port" = "443" ]; then
    printf '%s://%s' "$scheme" "$host"
  else
    printf '%s://%s:%s' "$scheme" "$host" "$https_port"
  fi
}

cert_to_pem() {
  openssl x509 -in "$1" -outform PEM -out "$2" >/dev/null 2>&1 && return 0
  openssl x509 -inform DER -in "$1" -outform PEM -out "$2" >/dev/null 2>&1
}

pubkey_fingerprint_from_key() { openssl pkey -in "$1" -pubout 2>/dev/null | openssl sha256 | awk '{print $2}'; }
pubkey_fingerprint_from_cert() { openssl x509 -in "$1" -pubkey -noout 2>/dev/null | openssl sha256 | awk '{print $2}'; }
is_self_signed() {
  [ "$(openssl x509 -in "$1" -noout -subject -nameopt RFC2253 | sed 's/^subject=//')" = "$(openssl x509 -in "$1" -noout -issuer -nameopt RFC2253 | sed 's/^issuer=//')" ]
}

certificate_names() {
  local cert="$1" names cn
  names="$(openssl x509 -in "$cert" -noout -ext subjectAltName 2>/dev/null | grep -oE 'DNS:[^, ]+' | cut -d: -f2- || true)"
  cn="$(openssl x509 -in "$cert" -noout -subject -nameopt RFC2253 | sed -n 's/^subject=.*CN=\([^,]*\).*$/\1/p')"
  if [ -n "$cn" ] && ! printf '%s\n' "$names" | grep -Fxq "$cn"; then
    names="${names}${names:+$'\n'}$cn"
  fi
  printf '%s\n' "$names" | sed '/^$/d' | awk '!seen[$0]++'
}

prepare_custom_tls() {
  local source_dir="$1" public_url="$2" output_dir="$3"
  local work cert_dir key_file="" p12_file="" p12_password="" key_fp leaf="" host current current_issuer candidate candidate_subject added=0 n=0
  validate_certificate_folder "$source_dir"
  work="$(mktemp -d)"
  cert_dir="$work/certs"
  mkdir -p "$cert_dir"

  while IFS= read -r -d '' file; do
    case "${file,,}" in
      *.zip)
        need unzip "A ZIP certificate bundle was found, but unzip is not installed."
        mkdir -p "$work/unpacked"
        unzip -qq -o "$file" -d "$work/unpacked" || fail "Could not unpack: $file"
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
      case "${file,,}" in *.p12|*.pfx) p12_file="$file"; break ;; esac
    done < <(find "$source_dir" "$work" -type f -print0)
    if [ -n "$p12_file" ]; then
      p12_password="$(prompt_secret "PKCS#12 password (leave empty if none)")"
      openssl pkcs12 -in "$p12_file" -nocerts -nodes -passin "pass:$p12_password" -out "$work/from-p12.key" >/dev/null 2>&1 || fail "Could not read the PKCS#12/PFX file with that password."
      key_file="$work/from-p12.key"
      openssl pkcs12 -in "$p12_file" -clcerts -nokeys -passin "pass:$p12_password" -out "$work/from-p12-leaf.pem" >/dev/null 2>&1 || true
      openssl pkcs12 -in "$p12_file" -cacerts -nokeys -passin "pass:$p12_password" -out "$work/from-p12-chain.pem" >/dev/null 2>&1 || true
    fi
  fi
  [ -n "$key_file" ] || fail "No usable private key found (.key, .p12 or .pfx)."

  while IFS= read -r -d '' file; do
    case "${file,,}" in
      *.cer|*.crt|*.pem)
        n=$((n + 1))
        cert_to_pem "$file" "$cert_dir/cert-$n.pem" || rm -f "$cert_dir/cert-$n.pem"
        ;;
      *.p7b|*.p7c)
        n=$((n + 1))
        openssl pkcs7 -print_certs -in "$file" -out "$work/p7-$n.pem" >/dev/null 2>&1 || openssl pkcs7 -inform DER -print_certs -in "$file" -out "$work/p7-$n.pem" >/dev/null 2>&1 || true
        ;;
    esac
  done < <(find "$source_dir" "$work" -type f -print0)

  [ ! -f "$work/from-p12-leaf.pem" ] || cp "$work/from-p12-leaf.pem" "$cert_dir/from-p12-leaf.pem"
  [ ! -f "$work/from-p12-chain.pem" ] || cp "$work/from-p12-chain.pem" "$cert_dir/from-p12-chain.pem"

  for bundle in "$work"/p7-*.pem "$cert_dir"/from-p12-chain.pem; do
    [ -f "$bundle" ] || continue
    awk -v dir="$cert_dir" 'BEGIN{n=0;out=""} /-----BEGIN CERTIFICATE-----/{n++;out=dir "/split-" n "-" systime() ".pem"} out!=""{print >> out} /-----END CERTIFICATE-----/{close(out);out=""}' "$bundle"
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

  TLS_CERT_NAMES="$(certificate_names "$leaf")"
  TLS_CERT_PRIMARY="$(printf '%s\n' "$TLS_CERT_NAMES" | head -n1)"
  TLS_CERT_EXPIRES="$(openssl x509 -in "$leaf" -noout -enddate | cut -d= -f2-)"

  if [ -n "$public_url" ]; then
    host="$(public_host "$public_url")"
    openssl x509 -in "$leaf" -noout -checkhost "$host" >/dev/null 2>&1 || fail "Certificate does not match host: $host"
  fi

  mkdir -p "$output_dir"
  cp "$key_file" "$output_dir/privkey.pem"
  chmod 600 "$output_dir/privkey.pem"
  cp "$leaf" "$output_dir/fullchain.pem"
  current="$leaf"
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
    is_self_signed "$candidate" && break
    cat "$candidate" >> "$output_dir/fullchain.pem"
    current="$candidate"
    added=$((added + 1))
    [ "$added" -lt 8 ] || break
  done
  TLS_CERT_FILE="$output_dir/fullchain.pem"
  TLS_KEY_FILE="$output_dir/privkey.pem"
  rm -rf "$work"
}

choose_url_from_certificate() {
  local wildcard="" name base host fqdn default_name
  while IFS= read -r name; do
    case "$name" in \*.*) wildcard="$name"; break ;; esac
  done <<< "$TLS_CERT_NAMES"

  printf '\n%s\n' "$(msg cert_detected)"
  printf '  %s: %s\n' "$(msg names)" "$(printf '%s' "$TLS_CERT_NAMES" | paste -sd ', ' -)"
  printf '  %s: %s\n' "$(msg expires)" "$TLS_CERT_EXPIRES"
  printf '  %s: OK\n' "$(msg private_key)"
  printf '  %s: OK\n' "$(msg chain)"

  if [ -n "$wildcard" ]; then
    base="${wildcard#*.}"
    while :; do
      host="$(prompt "$(msg hostname)" "mailflow")"
      [[ "$host" =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]] || {
        printf '%s\n' "$(msg invalid_hostname)" > /dev/tty
        continue
      }
      fqdn="$host.$base"
      if openssl x509 -in "$TLS_PREVIEW_DIR/fullchain.pem" -noout -checkhost "$fqdn" >/dev/null 2>&1; then
        PUBLIC_URL="https://$fqdn"
        break
      fi
      printf '%s %s\n' "$fqdn" "$(msg not_covered)" > /dev/tty
    done
  else
    default_name="${TLS_CERT_PRIMARY:-localhost}"
    while :; do
      fqdn="$(prompt "FQDN" "$default_name")"
      fqdn="${fqdn#https://}"
      fqdn="${fqdn#http://}"
      fqdn="${fqdn%%/*}"
      if openssl x509 -in "$TLS_PREVIEW_DIR/fullchain.pem" -noout -checkhost "$fqdn" >/dev/null 2>&1; then
        PUBLIC_URL="https://$fqdn"
        break
      fi
      printf '%s %s\n' "$fqdn" "$(msg not_covered)" > /dev/tty
    done
  fi
}

say "$(msg title)"
printf '%s\n' "$(msg motto)"
need git "git is required. Please install git and run this command again."
need openssl "openssl is required. Please install openssl and run this command again."
need docker "Docker is required. Install Docker Engine/Desktop first, then run this command again."
need curl "curl is required. Please install curl and run this command again."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required (docker compose)."
docker info >/dev/null 2>&1 || fail "Docker is installed but not reachable. Start Docker or fix your Docker permissions."

INSTALL_INPUT="$(prompt_path "$(msg install_dir)" "$INSTALL_DIR_DEFAULT")"
INSTALL_DIR="$(resolve_path "$INSTALL_INPUT" "$HOME")"
validate_install_dir "$INSTALL_DIR"

TLS_MODE="$(choose_tls)"
TLS_SOURCE_DIR=""
TLS_PREVIEW_DIR=""
case "$TLS_MODE" in
  1)
    TLS_MODE="automatic"
    PUBLIC_URL="$(normalize_public_url "$(prompt "FQDN" "mailflow.local")")"
    ;;
  2)
    TLS_MODE="custom"
    TLS_INPUT="$(prompt_path "$(msg cert_dir)" "$HOME")"
    TLS_SOURCE_DIR="$(resolve_path "$TLS_INPUT" "$HOME")"
    validate_certificate_folder "$TLS_SOURCE_DIR"
    TLS_PREVIEW_DIR="$(mktemp -d)"
    say "$(msg analyze_cert)"
    prepare_custom_tls "$TLS_SOURCE_DIR" "" "$TLS_PREVIEW_DIR"
    choose_url_from_certificate
    ;;
  *) fail "Invalid TLS choice. Use 1 or 2." ;;
esac

CADDY_ADDRESS="https://$(public_host "$PUBLIC_URL")"
choose_edge_ports "$INSTALL_DIR/.env"
PUBLIC_URL="$(apply_public_https_port "$PUBLIC_URL" "$HTTPS_PORT")"

printf '\n%s\n  %s: %s\n  %s: %s\n  %s: %s\n  %s: %s\n  %s: %s\n' \
  "$(msg validated)" \
  "$(msg install_dir)" "$INSTALL_DIR" \
  "$(msg public_url)" "$PUBLIC_URL" \
  "$(msg language)" "$INSTALL_LANGUAGE" \
  "$(msg http_port)" "$HTTP_PORT" \
  "$(msg https_port)" "$HTTPS_PORT"
if [ "$TLS_MODE" = "custom" ]; then
  printf '  %s: %s\n' "$(msg cert_folder)" "$TLS_SOURCE_DIR"
else
  printf '  TLS: automatic\n'
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  say "$(msg updating) $INSTALL_DIR"
  git -C "$INSTALL_DIR" fetch origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
elif [ -e "$INSTALL_DIR" ]; then
  fail "$INSTALL_DIR already exists but is not a Mailflow git checkout."
else
  say "$(msg cloning) $INSTALL_DIR"
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  cp .env.example "$ENV_FILE"
  say "$(msg create_config)"
else
  say "$(msg check_config)"
fi

ensure_env_secret SECRET_KEY secret_fernet "$ENV_FILE"
ensure_env_secret BETTER_AUTH_SECRET secret_hex "$ENV_FILE"
ensure_env_secret WEB_SECRET_KEY secret_hex "$ENV_FILE"
ensure_env_secret INTERNAL_API_SECRET secret_hex "$ENV_FILE"
ensure_env_secret POSTGRES_PASSWORD secret_hex "$ENV_FILE"

set_env MAILFLOW_DEPLOYMENT_SOURCE "cli" "$ENV_FILE"
set_env MAILFLOW_BOOTSTRAP_LANGUAGE "$INSTALL_LANGUAGE" "$ENV_FILE"
set_env MAILFLOW_TLS_MODE "$TLS_MODE" "$ENV_FILE"
set_env MAILFLOW_PUBLIC_URL "$PUBLIC_URL" "$ENV_FILE"
set_env MAILFLOW_CADDY_ADDRESS "$CADDY_ADDRESS" "$ENV_FILE"
set_env HTTP_PORT "$HTTP_PORT" "$ENV_FILE"
set_env HTTPS_PORT "$HTTPS_PORT" "$ENV_FILE"
set_env AUTH_MODE "single" "$ENV_FILE"
set_env WEB_AUTH "on" "$ENV_FILE"
set_env API_INTERNAL_URL "http://api:8000" "$ENV_FILE"
set_env API_DOCS_ENABLED "false" "$ENV_FILE"
set_env WORKER_MAX_EMAILS_PER_CYCLE "10" "$ENV_FILE"

if [ "$TLS_MODE" = "custom" ]; then
  say "$(msg prepare_tls)"
  prepare_custom_tls "$TLS_SOURCE_DIR" "$PUBLIC_URL" "$INSTALL_DIR/.mailflow/tls"
  set_env TLS_CERT_FILE "$TLS_CERT_FILE" "$ENV_FILE"
  set_env TLS_KEY_FILE "$TLS_KEY_FILE" "$ENV_FILE"
  rm -rf "$TLS_PREVIEW_DIR"
else
  set_env TLS_CERT_FILE "" "$ENV_FILE"
  set_env TLS_KEY_FILE "" "$ENV_FILE"
fi

host="$(public_host "$PUBLIC_URL")"
set_env BETTER_AUTH_URL "$PUBLIC_URL" "$ENV_FILE"
set_env NEXT_PUBLIC_APP_URL "$PUBLIC_URL" "$ENV_FILE"
set_env PASSKEY_RP_ID "${host:-localhost}" "$ENV_FILE"
set_env PASSKEY_ORIGIN "$PUBLIC_URL" "$ENV_FILE"
set_env CORS_ORIGINS "$PUBLIC_URL" "$ENV_FILE"
validate_env "$ENV_FILE"

COMPOSE_ARGS=(--env-file "$ENV_FILE" -f "$COMPOSE_FILE")
[ "$TLS_MODE" != "custom" ] || COMPOSE_ARGS+=(-f "$TLS_COMPOSE_FILE")

say "$(msg start_db)"
docker compose "${COMPOSE_ARGS[@]}" config >/dev/null || fail "Docker Compose configuration is invalid."
docker compose "${COMPOSE_ARGS[@]}" up -d postgres

say "$(msg prepare_auth)"
docker compose "${COMPOSE_ARGS[@]}" --profile migrate run --rm web-migrate

say "$(msg build_start)"
docker compose "${COMPOSE_ARGS[@]}" up -d --build

say "$(msg wait_ready)"
ready=0
for _ in $(seq 1 30); do
  if docker compose "${COMPOSE_ARGS[@]}" exec -T api python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status == 200 else 1)" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
[ "$ready" -eq 1 ] || fail "Mailflow started, but the API health check did not become ready."

if [[ "$PUBLIC_URL" = https://* ]]; then
  if [ "$TLS_MODE" = "custom" ]; then
    curl -fsS --connect-timeout 10 --resolve "$host:$HTTPS_PORT:127.0.0.1" "$PUBLIC_URL" >/dev/null || fail "Mailflow is running, but HTTPS verification failed for $PUBLIC_URL"
  else
    curl -kfsS --connect-timeout 10 --resolve "$host:$HTTPS_PORT:127.0.0.1" "$PUBLIC_URL" >/dev/null || fail "Mailflow is running, but HTTPS is not reachable at $PUBLIC_URL"
  fi
fi

printf '\n%s\n\n%s: %s\n\n' "$(msg ready)" "$(msg open)" "$PUBLIC_URL"
if [ "$TLS_MODE" = "automatic" ]; then
  printf '%s\n' "TLS: automatic certificate management enabled."
else
  printf '%s\n' "TLS: certificate bundle auto-detected, assembled, validated and HTTPS verified."
fi
printf '%s\n' "$(msg next)"
