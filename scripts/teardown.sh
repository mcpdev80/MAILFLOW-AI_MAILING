#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR_DEFAULT="$HOME/mailflow"
COMPOSE_FILE="infrastructure/docker-compose.yml"
EXPECTED_REMOTE="https://github.com/mcpdev80/MAILFLOW-AI_MAILING.git"

resolve_path() {
  local value="$1" base="$2"
  case "$value" in
    "~") value="$HOME" ;;
    "~/"*) value="$HOME/${value#~/}" ;;
  esac
  [[ "$value" = /* ]] || value="$base/$value"
  if command -v realpath >/dev/null 2>&1; then
    realpath -m "$value"
  else
    printf '%s' "$value"
  fi
}

detect_system_language() {
  local locale="${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}"
  locale="${locale,,}"
  case "$locale" in
    de*|*de_de*) printf 'de' ;;
    es*|*es_es*) printf 'es' ;;
    *) printf 'en' ;;
  esac
}

LANGUAGE="$(detect_system_language)"

msg() {
  local key="$1"
  case "$LANGUAGE:$key" in
    de:title) printf 'Mailflow vollständig zurücksetzen' ;;
    de:warning) printf 'ACHTUNG: Container, Volumes, Datenbankdaten, Redis-Daten, Caddy-Daten, lokal gebaute Mailflow-Images, erzeugte TLS-Kopien, .env und das Installationsverzeichnis werden gelöscht.' ;;
    de:external_cert) printf 'Dein ursprünglicher Zertifikatsordner außerhalb von Mailflow wird NICHT gelöscht.' ;;
    de:install_dir) printf 'Installationsverzeichnis' ;;
    de:not_found) printf 'Kein Mailflow-Installationsverzeichnis gefunden:' ;;
    de:not_repo) printf 'Das Verzeichnis ist kein erkennbares Mailflow-Checkout. Abbruch zum Schutz deiner Daten:' ;;
    de:confirm) printf 'Zum endgültigen Löschen exakt MAILFLOW LOESCHEN eingeben' ;;
    de:cancelled) printf 'Abgebrochen. Es wurde nichts gelöscht.' ;;
    de:stopping) printf 'Mailflow-Container, Netzwerke und Volumes werden entfernt' ;;
    de:removing_dir) printf 'Installationsverzeichnis wird entfernt' ;;
    de:done) printf 'Mailflow wurde vollständig entfernt. Der Rechner ist bezüglich dieser Installation wieder im Ausgangszustand.' ;;
    es:title) printf 'Restablecer Mailflow completamente' ;;
    es:warning) printf 'ADVERTENCIA: se eliminarán contenedores, volúmenes, datos de PostgreSQL y Redis, datos de Caddy, imágenes locales de Mailflow, copias TLS generadas, .env y el directorio de instalación.' ;;
    es:external_cert) printf 'La carpeta original de certificados fuera de Mailflow NO se eliminará.' ;;
    es:install_dir) printf 'Directorio de instalación' ;;
    es:not_found) printf 'No se encontró el directorio de instalación de Mailflow:' ;;
    es:not_repo) printf 'El directorio no parece ser un checkout de Mailflow. Se cancela para proteger tus datos:' ;;
    es:confirm) printf 'Para eliminar definitivamente escribe exactamente MAILFLOW DELETE' ;;
    es:cancelled) printf 'Cancelado. No se eliminó nada.' ;;
    es:stopping) printf 'Eliminando contenedores, redes y volúmenes de Mailflow' ;;
    es:removing_dir) printf 'Eliminando directorio de instalación' ;;
    es:done) printf 'Mailflow se ha eliminado completamente. Esta instalación ha vuelto al estado inicial.' ;;
    *:title) printf 'Fully reset Mailflow' ;;
    *:warning) printf 'WARNING: containers, volumes, PostgreSQL/Redis data, Caddy data, locally built Mailflow images, generated TLS copies, .env and the installation directory will be deleted.' ;;
    *:external_cert) printf 'Your original certificate folder outside Mailflow will NOT be deleted.' ;;
    *:install_dir) printf 'Install directory' ;;
    *:not_found) printf 'No Mailflow install directory found:' ;;
    *:not_repo) printf 'The directory is not a recognized Mailflow checkout. Stopping to protect your data:' ;;
    *:confirm) printf 'To permanently delete it, type exactly MAILFLOW DELETE' ;;
    *:cancelled) printf 'Cancelled. Nothing was deleted.' ;;
    *:stopping) printf 'Removing Mailflow containers, networks and volumes' ;;
    *:removing_dir) printf 'Removing installation directory' ;;
    *:done) printf 'Mailflow was completely removed. This installation is back to its original state.' ;;
  esac
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

printf '\n==> %s\n\n%s\n%s\n\n' "$(msg title)" "$(msg warning)" "$(msg external_cert)"

INSTALL_INPUT="$(prompt_path "$(msg install_dir)" "$INSTALL_DIR_DEFAULT")"
INSTALL_DIR="$(resolve_path "$INSTALL_INPUT" "$HOME")"

if [ ! -d "$INSTALL_DIR" ]; then
  printf '%s %s\n' "$(msg not_found)" "$INSTALL_DIR" >&2
  exit 1
fi

if [ ! -f "$INSTALL_DIR/$COMPOSE_FILE" ]; then
  printf '%s %s\n' "$(msg not_repo)" "$INSTALL_DIR" >&2
  exit 1
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  remote="$(git -C "$INSTALL_DIR" remote get-url origin 2>/dev/null || true)"
  case "$remote" in
    "$EXPECTED_REMOTE"|git@github.com:mcpdev80/MAILFLOW-AI_MAILING.git) ;;
    *)
      printf '%s %s\n' "$(msg not_repo)" "$INSTALL_DIR" >&2
      exit 1
      ;;
  esac
fi

printf '%s\n' "$(msg confirm)"
if [ -r /dev/tty ]; then
  IFS= read -r confirmation < /dev/tty || true
else
  confirmation=""
fi

case "$LANGUAGE" in
  de) expected="MAILFLOW LOESCHEN" ;;
  *) expected="MAILFLOW DELETE" ;;
esac

if [ "${confirmation:-}" != "$expected" ]; then
  printf '%s\n' "$(msg cancelled)"
  exit 0
fi

cd "$INSTALL_DIR"
ENV_FILE="$INSTALL_DIR/.env"
COMPOSE_ARGS=(-f "$COMPOSE_FILE")
if [ -f "$ENV_FILE" ]; then
  COMPOSE_ARGS=(--env-file "$ENV_FILE" -f "$COMPOSE_FILE")
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  printf '\n==> %s\n' "$(msg stopping)"
  docker compose "${COMPOSE_ARGS[@]}" down --volumes --remove-orphans --rmi local || true
fi

printf '\n==> %s\n' "$(msg removing_dir)"
cd "$HOME"
rm -rf -- "$INSTALL_DIR"

printf '\n%s\n' "$(msg done)"
