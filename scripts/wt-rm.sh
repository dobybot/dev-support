#!/usr/bin/env bash
# Remove all worktrees and the ticket folder for a ticket.
#
# Usage: wt-rm.sh TICKET [--force]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="$(cd "$SCRIPT_DIR/../.." && pwd)"

err() { echo "error: $*" >&2; exit 1; }

[[ $# -lt 1 ]] && err "usage: $(basename "$0") TICKET [--force]"

TICKET="$1"; shift
FORCE_FLAG=""
[[ "${1:-}" == "--force" ]] && FORCE_FLAG="--force"

TICKET_DIR="$WORKSPACE/tickets/$TICKET"
[[ -d "$TICKET_DIR" ]] || err "no ticket folder: $TICKET_DIR"

for wt in "$TICKET_DIR"/*; do
  [[ -d "$wt" ]] || continue
  repo="$(basename "$wt")"
  src="$WORKSPACE/$repo"
  [[ -d "$src" ]] || { echo "skipping unknown repo: $repo"; continue; }
  echo "→ removing worktree: $wt"
  git -C "$src" worktree remove $FORCE_FLAG "$wt"
done

rm -f "$TICKET_DIR/$TICKET.code-workspace"
rmdir "$TICKET_DIR" 2>/dev/null || echo "note: $TICKET_DIR not empty, leaving it"
echo "✓ done"
