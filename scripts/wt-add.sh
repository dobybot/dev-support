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
  ( cd "$wt" && ~/.pyenv/versions/3.9.20/bin/python3.9 -m venv .venv && .venv/bin/pip install -r requirements.txt )
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

ws_file="$TICKET_DIR/$TICKET.code-workspace"
cat > "$ws_file" <<EOF
{
  "folders": [
    {
      "name": "$TICKET",
      "path": "."
    },
    {
      "name": "dev-support",
      "path": "../../dev-support"
    }
  ],
  "launch": {
    "version": "0.2.0",
    "configurations": [
      {
        "name": "dobybot: runserver",
        "type": "python",
        "request": "launch",
        "program": "\${workspaceFolder:$TICKET}/dobybot/manage.py",
        "args": ["runserver", "0:8000"],
        "django": true,
        "console": "integratedTerminal",
        "python": "\${workspaceFolder:$TICKET}/dobybot/.venv/bin/python",
        "cwd": "\${workspaceFolder:$TICKET}/dobybot"
      },
      {
        "name": "dobybot-ui: uidev",
        "type": "node-terminal",
        "request": "launch",
        "command": "yarn uidev",
        "cwd": "\${workspaceFolder:$TICKET}/dobybot-ui"
      },
      {
        "name": "dobybot-report-ui: dev",
        "type": "node-terminal",
        "request": "launch",
        "command": "pnpm dev --host 0.0.0.0",
        "cwd": "\${workspaceFolder:$TICKET}/dobybot-report-ui"
      }
    ],
    "compounds": [
      {
        "name": "All Servers",
        "configurations": [
          "dobybot: runserver",
          "dobybot-ui: uidev",
          "dobybot-report-ui: dev"
        ],
        "stopAll": true
      }
    ]
  }
}
EOF

echo
echo "✓ done. workspace file: $ws_file"
if command -v code >/dev/null 2>&1; then
  echo "  opening in VS Code..."
  code "$ws_file"
else
  echo "  open with: code \"$ws_file\""
fi
