#!/usr/bin/env bash
set -euo pipefail

# Teardown may remove the directory the invoking shell is currently in.
# Start from a stable directory so readline/tab completion and path hooks can resolve cwd.
cd "$HOME"

REPO_SLUG="mcpdev80/MAILFLOW-AI_MAILING"
DEFAULT_INSTALL="$HOME/mailflow"

parse_ref_from_url() {
  local url="$1" rest
  case "$url" in
    https://raw.githubusercontent.com/$REPO_SLUG/*/scripts/install.sh)
      rest="${url#https://raw.githubusercontent.com/$REPO_SLUG/}"
      printf '%s' "${rest%/scripts/install.sh}"
      return 0
      ;;
  esac
  return 1
}

resolve_install_ref() {
  local candidate="${MAILFLOW_INSTALL_REF:-}" source_url="${MAILFLOW_INSTALL_URL:-}" current=""

  if [ -n "$candidate" ]; then
    printf '%s' "$candidate"
    return
  fi

  if [ -n "$source_url" ]; then
    parse_ref_from_url "$source_url" && return
  fi

  if [ -n "${1:-}" ]; then
    if parse_ref_from_url "$1" 2>/dev/null; then
      return
    fi
    printf '%s' "$1"
    return
  fi

  # For a local/resume invocation, stay on the currently checked out branch.
  if [ -d "$DEFAULT_INSTALL/.git" ]; then
    current="$(git -C "$DEFAULT_INSTALL" branch --show-current 2>/dev/null || true)"
    if [ -n "$current" ]; then
      printf '%s' "$current"
      return
    fi
  fi

  printf 'main'
}

BRANCH="$(resolve_install_ref "${1:-}")"
export MAILFLOW_INSTALL_REF="$BRANCH"
RAW_BASE="https://raw.githubusercontent.com/$REPO_SLUG/$BRANCH/scripts"

language() {
  local locale="${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}"
  locale="${locale,,}"
  case "$locale" in
    de*|*de_de*) printf 'de' ;;
    es*|*es_es*) printf 'es' ;;
    *) printf 'en' ;;
  esac
}

LANGUAGE="$(language)"

msg() {
  local key="$1"
  case "$LANGUAGE:$key" in
    de:title) printf 'Geführte Mailflow-Installation' ;;
    de:found) printf 'Vorhandene Mailflow-Installation gefunden:' ;;
    de:continue) printf 'Vorhandene Installation fortführen' ;;
    de:new) printf 'Neue Installation starten' ;;
    de:choice) printf 'Auswahl' ;;
    de:new_hint) printf 'Für eine neue Installation im nächsten Schritt bitte ein anderes Installationsverzeichnis wählen.' ;;
    de:updating) printf 'Vorhandene Installation wird aktualisiert' ;;
    es:title) printf 'Instalación guiada de Mailflow' ;;
    es:found) printf 'Se encontró una instalación existente de Mailflow:' ;;
    es:continue) printf 'Continuar la instalación existente' ;;
    es:new) printf 'Iniciar una instalación nueva' ;;
    es:choice) printf 'Selección' ;;
    es:new_hint) printf 'Para una instalación nueva, elige otro directorio de instalación en el siguiente paso.' ;;
    es:updating) printf 'Actualizando la instalación existente' ;;
    *:title) printf 'Mailflow guided installer' ;;
    *:found) printf 'Existing Mailflow installation found:' ;;
    *:continue) printf 'Continue existing installation' ;;
    *:new) printf 'Start a new installation' ;;
    *:choice) printf 'Choice' ;;
    *:new_hint) printf 'For a new installation, choose a different install directory in the next step.' ;;
    *:updating) printf 'Updating existing installation' ;;
  esac
}

is_mailflow_install() {
  local dir="$1" remote=""
  [ -d "$dir/.git" ] || return 1
  [ -f "$dir/infrastructure/docker-compose.yml" ] || return 1
  remote="$(git -C "$dir" remote get-url origin 2>/dev/null || true)"
  case "$remote" in
    https://github.com/mcpdev80/MAILFLOW-AI_MAILING.git|git@github.com:mcpdev80/MAILFLOW-AI_MAILING.git) return 0 ;;
    *) return 1 ;;
  esac
}

printf '\n==> %s\n' "$(msg title)"
printf 'Git ref: %s\n' "$BRANCH"

if is_mailflow_install "$DEFAULT_INSTALL"; then
  printf '\n%s\n  %s\n\n' "$(msg found)" "$DEFAULT_INSTALL"
  printf '  1) %s\n' "$(msg continue)"
  printf '  2) %s\n' "$(msg new)"
  if [ -r /dev/tty ]; then
    IFS= read -r -p "$(msg choice) [1]: " choice < /dev/tty || true
  else
    choice="1"
  fi
  choice="${choice:-1}"
  case "$choice" in
    1)
      printf '\n==> %s\n' "$(msg updating)"
      git -C "$DEFAULT_INSTALL" fetch origin "$BRANCH"
      git -C "$DEFAULT_INSTALL" checkout "$BRANCH"
      git -C "$DEFAULT_INSTALL" pull --ff-only origin "$BRANCH"
      MAILFLOW_INSTALL_REF="$BRANCH" MAILFLOW_SKIP_SELF_UPDATE=1 exec bash "$DEFAULT_INSTALL/scripts/resume.sh" "$DEFAULT_INSTALL"
      ;;
    2)
      printf '\n%s\n' "$(msg new_hint)"
      MAILFLOW_INSTALL_REF="$BRANCH" exec bash <(curl -fsSL "$RAW_BASE/install-core.sh") "$BRANCH"
      ;;
    *)
      printf 'Invalid choice.\n' >&2
      exit 1
      ;;
  esac
else
  MAILFLOW_INSTALL_REF="$BRANCH" exec bash <(curl -fsSL "$RAW_BASE/install-core.sh") "$BRANCH"
fi
