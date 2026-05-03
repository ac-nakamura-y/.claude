#!/usr/bin/env bash
# Install this repo's contents into ~/.claude/.
#
# Idempotent. Safe to run multiple times.
#
# - agents/, commands/, skills/, hooks/, CLAUDE.md are SYMLINKED so future repo
#   edits flow into ~/.claude/ automatically (and any direct edits to
#   ~/.claude/agents/foo.md flow back into the repo for version control).
# - settings.json is COPIED, not symlinked, because the `claude` CLI writes
#   to ~/.claude/settings.json (e.g. when installing plugins or auto-granting
#   permissions). A symlink would push those writes back into the repo.
#   Re-run with --force-settings to overwrite ~/.claude/settings.json.
# - .claude-plugin/marketplace.json declares this repo as a personal plugin
#   marketplace. install.sh registers it via `claude plugin marketplace add`.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_CLAUDE="${HOME}/.claude"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

FORCE_SETTINGS=0
for arg in "$@"; do
  case "$arg" in
    --force-settings) FORCE_SETTINGS=1 ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

mkdir -p "$HOME_CLAUDE"

backup_if_real() {
  local path="$1"
  if [ -L "$path" ] || [ ! -e "$path" ]; then
    return 0
  fi
  mv "$path" "${path}.bak.${TS}"
  printf '  bak  %s -> %s.bak.%s\n' "$(basename "$path")" "$(basename "$path")" "$TS"
}

link_path() {
  local name="$1"
  local src="${REPO_ROOT}/${name}"
  local dst="${HOME_CLAUDE}/${name}"

  if [ ! -e "$src" ] && [ ! -L "$src" ]; then
    return 0
  fi

  if [ -L "$dst" ]; then
    if [ "$(readlink "$dst")" = "$src" ]; then
      printf '  ok   %-15s already linked\n' "$name"
      return 0
    fi
    mv "$dst" "${dst}.bak.${TS}"
    printf '  bak  %-15s old symlink -> %s.bak.%s\n' "$name" "$name" "$TS"
  elif [ -e "$dst" ]; then
    mv "$dst" "${dst}.bak.${TS}"
    printf '  bak  %-15s existing path -> %s.bak.%s\n' "$name" "$name" "$TS"
  fi

  ln -s "$src" "$dst"
  printf '  link %-15s -> %s\n' "$name" "$src"
}

copy_settings() {
  local src="${REPO_ROOT}/settings.json"
  local dst="${HOME_CLAUDE}/settings.json"

  if [ ! -f "$src" ]; then
    return 0
  fi

  if [ -e "$dst" ] && [ "$FORCE_SETTINGS" -eq 0 ]; then
    if [ -L "$dst" ]; then
      backup_if_real "$dst"
    else
      printf '  ok   %-15s already exists (use --force-settings to overwrite)\n' "settings.json"
      return 0
    fi
  fi

  if [ -L "$dst" ]; then
    rm "$dst"
  elif [ -e "$dst" ] && [ "$FORCE_SETTINGS" -eq 1 ]; then
    backup_if_real "$dst"
  fi

  cp "$src" "$dst"
  printf '  copy %-15s -> %s\n' "settings.json" "$dst"
}

echo "Installing personal Claude Code config"
echo "  source: ${REPO_ROOT}"
echo "  target: ${HOME_CLAUDE}"
echo

echo "Symlinking entries..."
for name in agents commands skills hooks CLAUDE.md; do
  link_path "$name"
done
copy_settings
echo

if command -v claude >/dev/null 2>&1; then
  echo "Registering personal marketplace (idempotent)..."
  claude plugin marketplace add "$REPO_ROOT" 2>&1 | sed 's/^/  /' || true
  echo

  echo "Installing trinity plugin (idempotent)..."
  claude plugin install trinity@yujis-personal 2>&1 | sed 's/^/  /' || true
else
  echo "WARN: 'claude' CLI not found in PATH. Skipping marketplace/plugin registration."
  echo "      After installing Claude Code, run:"
  echo "        claude plugin marketplace add ${REPO_ROOT}"
  echo "        claude plugin install trinity@yujis-personal"
fi

echo
echo "Done. Start a new Claude Code session and try:"
echo "  /trinity:run --max-iter=2 <requirement>"
