#!/usr/bin/env bash
# Create per-ticket git worktrees for the dobybot stack and prepare deps — in parallel.
#
# This script lives inside the start-work-on-jira-issue skill folder (~/.claude/skills/...),
# which is OUTSIDE any workspace and identical for every dev. It therefore CANNOT self-locate
# the workspace — the caller MUST pass --workspace.
#
# Usage:
#   wt-add.sh --workspace <abs> --ticket <T> --branch <B> [--with-dobysync] [--dobysync-env <path>]
#
#   --workspace     Absolute path to the dobybot-workspace (contains dev-support/ + the repos).
#   --ticket        Folder name under workspace/tickets/, e.g. DBT-417.
#   --branch        Existing local branch to attach where present; repos lacking it go detached (run-only).
#   --with-dobysync Also scaffold a dobysync worktree (separate stack, py3.11/poetry, :8001).
#   --dobysync-env  Abs path to the safe local-:5433 dobysync .env (copied, never symlinked).
#
# Always scaffolds the dobybot stack (dobybot, dobybot-ui, dobybot-report-ui) for F5.
# Dep installs run concurrently; worktree creation (git) stays sequential (it's fast).

set -euo pipefail

err() { echo "error: $*" >&2; exit 1; }

WORKSPACE="" TICKET="" BRANCH="" WITH_DOBYSYNC=0 DOBYSYNC_ENV=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace)     WORKSPACE="$2"; shift 2 ;;
    --ticket)        TICKET="$2"; shift 2 ;;
    --branch)        BRANCH="$2"; shift 2 ;;
    --with-dobysync) WITH_DOBYSYNC=1; shift ;;
    --dobysync-env)  DOBYSYNC_ENV="$2"; shift 2 ;;
    *) err "unknown arg: $1" ;;
  esac
done

[[ -n "$WORKSPACE" ]] || err "--workspace is required"
[[ -n "$TICKET"    ]] || err "--ticket is required"
[[ -n "$BRANCH"    ]] || err "--branch is required"
[[ -d "$WORKSPACE" ]] || err "workspace not found: $WORKSPACE"
[[ -d "$WORKSPACE/dev-support" ]] || err "not a dobybot-workspace (no dev-support/): $WORKSPACE"

TICKET_DIR="$WORKSPACE/tickets/$TICKET"
mkdir -p "$TICKET_DIR"

LOGDIR="$TICKET_DIR/.wt-setup-logs"
mkdir -p "$LOGDIR"

# Stack repos always scaffolded for the F5 stack; dobysync appended only when edited.
REPOS=(dobybot dobybot-ui dobybot-report-ui)
if [[ "$WITH_DOBYSYNC" -eq 1 ]]; then
  REPOS+=(dobysync)
  [[ -n "$DOBYSYNC_ENV" ]] || err "--with-dobysync requires --dobysync-env <abs path to safe local :5433 .env>"
  [[ -f "$DOBYSYNC_ENV" ]] || err "dobysync env file not found: $DOBYSYNC_ENV"
fi

# ---- dep setup functions (run inside background subshells; each logs to its own file) ----

setup_dobybot() {
  local wt="$1"
  ln -sf "../../../dobybot/.env" "$wt/.env"
  # Stack-aware (mid py3.9->3.12 migration): uat is py3.12 + uv; main is py3.9 + pip.
  # Detect from the worktree's own pyproject.toml so dep setup matches the checked-out branch.
  if grep -q 'requires-python = ">=3.12' "$wt/pyproject.toml" 2>/dev/null; then
    ( cd "$wt" && uv sync )
  else
    ( cd "$wt" && ~/.pyenv/versions/3.9.20/bin/python3.9 -m venv .venv && .venv/bin/pip install -r requirements.txt )
  fi
}

setup_dobybot_ui() {
  local wt="$1"
  ln -sf "../../../dobybot-ui/.env" "$wt/.env"
  # yarn 1 intermittently writes an inconsistent node_modules into a fresh worktree which then
  # dies at `yarn uidev`; a clean reinstall is the reliable cure. Verify nuxt bin, retry once.
  (
    cd "$wt"
    rm -rf node_modules .nuxt
    yarn install
    if [[ ! -x node_modules/.bin/nuxt ]]; then
      echo "  dobybot-ui: node_modules broken after install (nuxt bin missing) — retrying clean once" >&2
      rm -rf node_modules .nuxt
      yarn install
    fi
    [[ -x node_modules/.bin/nuxt ]] || { echo "dobybot-ui: node_modules still broken after retry — run 'yarn install' by hand" >&2; exit 1; }
  )
}

setup_dobybot_report_ui() {
  local wt="$1"
  ( cd "$wt" && pnpm install )
}

setup_dobysync() {
  local wt="$1"
  # SAFETY: dobysync's shared .env points at PROD (:15434) with load_dotenv(override=True),
  # so a symlink would let `manage.py test` create a test DB on PROD. COPY the safe local
  # (:5433) .env instead — never symlink it.
  cp "$DOBYSYNC_ENV" "$wt/.env"
  # Reuse the main checkout's poetry venv (deps identical) — fast, and matches the known-good
  # manual flow. Symlink rather than `poetry install` to avoid a multi-minute reinstall.
  ln -sf "../../../dobysync/.venv" "$wt/.venv"
  [[ -e "$wt/.venv/bin/python" ]] || { echo "dobysync: symlinked .venv has no bin/python — run 'poetry install' in $WORKSPACE/dobysync first" >&2; exit 1; }
}

run_setup() {
  # Runs one repo's dep setup, capturing log + exit code to files (macOS bash 3.2 safe — no assoc arrays).
  local repo="$1" wt="$2"
  (
    case "$repo" in
      dobybot)           setup_dobybot "$wt" ;;
      dobybot-ui)        setup_dobybot_ui "$wt" ;;
      dobybot-report-ui) setup_dobybot_report_ui "$wt" ;;
      dobysync)          setup_dobysync "$wt" ;;
      *) echo "  (no setup defined for $repo, skipping deps)" ;;
    esac
  ) > "$LOGDIR/$repo.log" 2>&1
  echo "$?" > "$LOGDIR/$repo.exit"
}

# ---- 1) create worktrees (sequential — git worktree add is fast) ----

for repo in "${REPOS[@]}"; do
  src="$WORKSPACE/$repo"
  wt="$TICKET_DIR/$repo"
  [[ -d "$src" ]] || err "source repo not found: $src"
  [[ -e "$wt" ]] && err "worktree already exists: $wt (run dev-support/scripts/wt-rm.sh $TICKET first)"

  echo "→ $repo: creating worktree at $wt"
  if git -C "$src" show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git -C "$src" worktree add "$wt" "$BRANCH"
  else
    # Repo not edited by this ticket — bring it in detached at its current base purely so the
    # full stack runs on F5 ("All Servers"). No throwaway ticket branch here.
    echo "  ($BRANCH absent here → detached at base for run-only)"
    git -C "$src" worktree add --detach "$wt"
  fi
done

# ---- 2) prepare deps for all repos IN PARALLEL ----

echo "→ preparing deps in parallel (logs: $LOGDIR/<repo>.log)"
for repo in "${REPOS[@]}"; do
  run_setup "$repo" "$TICKET_DIR/$repo" &
done
wait

dep_fail=0
for repo in "${REPOS[@]}"; do
  code="$(cat "$LOGDIR/$repo.exit" 2>/dev/null || echo 1)"
  if [[ "$code" == "0" ]]; then
    echo "  ✓ $repo deps ready"
  else
    echo "  ✗ $repo deps FAILED (exit $code) — log below:" >&2
    sed 's/^/    /' "$LOGDIR/$repo.log" >&2 || true
    dep_fail=1
  fi
done

# ---- 3) write the multi-root VS Code workspace (F5 boots "All Servers") ----

ws_file="$TICKET_DIR/$TICKET.code-workspace"

dobysync_folder=""
dobysync_launch=""
dobysync_compound=""
if [[ "$WITH_DOBYSYNC" -eq 1 ]]; then
  dobysync_folder=$'\n    { "name": "dobysync", "path": "./dobysync" },'
  dobysync_launch=$(cat <<DSYNC
,
      {
        "name": "dobysync: runserver",
        "type": "python",
        "request": "launch",
        "program": "\${workspaceFolder:$TICKET}/dobysync/manage.py",
        "args": ["runserver", "0:8001"],
        "django": true,
        "console": "integratedTerminal",
        "python": "\${workspaceFolder:$TICKET}/dobysync/.venv/bin/python",
        "cwd": "\${workspaceFolder:$TICKET}/dobysync"
      }
DSYNC
)
  dobysync_compound=$',\n          "dobysync: runserver"'
fi

cat > "$ws_file" <<EOF
{
  "folders": [
    { "name": "$TICKET", "path": "." },$dobysync_folder
    { "name": "dev-support", "path": "../../dev-support" }
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
      }$dobysync_launch
    ],
    "compounds": [
      {
        "name": "All Servers",
        "configurations": [
          "dobybot: runserver",
          "dobybot-ui: uidev",
          "dobybot-report-ui: dev"$dobysync_compound
        ],
        "stopAll": true
      }
    ]
  }
}
EOF

echo "→ wrote workspace: $ws_file"

if [[ "$dep_fail" -ne 0 ]]; then
  err "one or more repos failed dep setup (see logs above)"
fi

echo "DONE: worktrees ready at $TICKET_DIR (open $ws_file in VS Code to F5 the stack)"
