#!/usr/bin/env bash
# Create per-ticket git worktrees for the dobybot stack and prepare deps.
#
# Usage: wt-add.sh TICKET BRANCH [--repos r1,r2,...]
#   TICKET  Folder name under workspace/tickets/, e.g. DOBY-123
#   BRANCH  Existing local or remote branch to check out
#
# Default repos: dobybot, dobybot-ui, dobybot-report-ui

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="$(cd "$SCRIPT_DIR/../.." && pwd)"
TICKETS_DIR="$WORKSPACE/tickets"

DEFAULT_REPOS=(dobybot dobybot-ui dobybot-report-ui)

err() { echo "error: $*" >&2; exit 1; }

[[ $# -lt 2 ]] && err "usage: $(basename "$0") TICKET BRANCH [--repos r1,r2,...]"

TICKET="$1"; BRANCH="$2"; shift 2
REPOS=("${DEFAULT_REPOS[@]}")

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repos) IFS=',' read -ra REPOS <<< "$2"; shift 2 ;;
    *) err "unknown arg: $1" ;;
  esac
done

TICKET_DIR="$TICKETS_DIR/$TICKET"
mkdir -p "$TICKET_DIR"

setup_dobybot() {
  local wt="$1"
  ln -sf "../../../dobybot/.env" "$wt/.env"
  ( cd "$wt" && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt )
}

setup_dobybot_ui() {
  local wt="$1"
  ln -sf "../../../dobybot-ui/.env" "$wt/.env"
  ( cd "$wt" && yarn install )
}

setup_dobybot_report_ui() {
  local wt="$1"
  ( cd "$wt" && pnpm install )
}

for repo in "${REPOS[@]}"; do
  src="$WORKSPACE/$repo"
  wt="$TICKET_DIR/$repo"

  [[ -d "$src" ]] || err "source repo not found: $src"
  [[ -e "$wt" ]] && err "worktree already exists: $wt (run wt-rm.sh $TICKET first)"

  echo "→ $repo: creating worktree at $wt"
  git -C "$src" worktree add "$wt" "$BRANCH"

  echo "→ $repo: preparing deps"
  case "$repo" in
    dobybot)            setup_dobybot "$wt" ;;
    dobybot-ui)         setup_dobybot_ui "$wt" ;;
    dobybot-report-ui)  setup_dobybot_report_ui "$wt" ;;
    *) echo "  (no setup defined for $repo, skipping deps)" ;;
  esac
done

echo
echo "✓ done. open in vscode:"
for repo in "${REPOS[@]}"; do
  echo "  code $TICKET_DIR/$repo"
done
