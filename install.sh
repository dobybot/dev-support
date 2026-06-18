#!/usr/bin/env bash
#
# install.sh — one-time per-developer setup for dev-support team skills.
#
# Registers a user-level Claude Code SessionStart hook that runs
# .agents/sync-skills.sh on every launch, then does the first sync.
# The hook lives in ~/.claude/settings.json (user scope) so it fires no
# matter which project Claude Code opens. The absolute path to this clone
# is resolved here and baked into the hook — re-run install.sh if you move
# the clone.
#
# Safe to run repeatedly: the hook is de-duplicated by command basename.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC="$REPO/.agents/sync-skills.sh"
SETTINGS="$HOME/.claude/settings.json"

# --- prerequisites ---
command -v jq >/dev/null 2>&1 || {
  echo "ERROR: jq is required. Install it (brew install jq) and re-run." >&2
  exit 1
}
[ -f "$SYNC" ] || { echo "ERROR: missing $SYNC" >&2; exit 1; }
chmod +x "$SYNC"

mkdir -p "$(dirname "$SETTINGS")"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"

# --- backup ---
backup="$SETTINGS.bak.$$"
cp "$SETTINGS" "$backup"
echo "Backed up settings -> $backup"

# --- merge SessionStart hook idempotently ---
# Drop any prior hook group that runs a sync-skills.sh (handles a moved clone),
# then append the current absolute path.
tmp="$(mktemp)"
jq --arg cmd "$SYNC" '
  .SessionStart = (
    ((.SessionStart // [])
      | map(select(([.hooks[].command] | any(endswith("sync-skills.sh"))) | not)))
    + [ { "hooks": [ { "type": "command", "command": $cmd } ] } ]
  )
' "$SETTINGS" > "$tmp"

# Sanity-check the result is valid JSON before overwriting.
jq -e . "$tmp" >/dev/null
mv "$tmp" "$SETTINGS"
echo "Registered SessionStart hook -> $SYNC"

# --- first sync now ---
echo "Running initial sync..."
bash "$SYNC"

echo
echo "Done. New skills will appear after: git pull && relaunch Claude Code."
