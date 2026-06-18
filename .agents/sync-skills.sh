#!/usr/bin/env bash
#
# sync-skills.sh — link dev-support team skills/agents/commands into the
# developer's Claude Code config. Idempotent. Runs on every SessionStart
# (registered by install.sh), so `git pull` + relaunch = new skills appear.
#
# Behavior:
#   - one symlink per child (Claude Code scans direct children only).
#   - skip-on-collision: never clobbers a personal skill of the same name.
#   - prune: removes our own links whose upstream source was deleted.
#   - leaves all non-repo (personal) entries untouched.
#
# All human-facing output goes to stderr; stdout stays empty so the
# SessionStart hook injects nothing into the model context.

set -euo pipefail
shopt -s nullglob

# Repo root = parent of this script's .agents/ dir.
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# source-subdir : destination-dir
MAP=(
  "skills:$HOME/.claude/skills"
  "agents:$HOME/.claude/agents"
  "commands:$HOME/.claude/commands"
)

log()  { printf '[sync-skills] %s\n' "$*" >&2; }
warn() { printf '[sync-skills] WARN: %s\n' "$*" >&2; }

linked=0 skipped=0 pruned=0

for entry in "${MAP[@]}"; do
  type="${entry%%:*}"
  dest="${entry#*:}"
  src="$REPO/.agents/$type"

  [ -d "$src" ] || continue          # nothing of this type in the repo yet
  mkdir -p "$dest"

  # --- prune: drop our own links whose source no longer exists ---
  for link in "$dest"/*; do
    [ -L "$link" ] || continue        # only touch symlinks
    target="$(readlink "$link")"
    case "$target" in
      "$src"/*)
        if [ ! -e "$link" ]; then     # broken -> upstream skill removed
          rm -f "$link"
          pruned=$((pruned + 1))
          log "pruned $(basename "$link") ($type)"
        fi
        ;;
    esac
  done

  # --- link: one symlink per source child ---
  for child in "$src"/*/; do
    name="$(basename "$child")"
    child="${child%/}"                # strip trailing slash for clean target
    target="$dest/$name"

    if [ -L "$target" ]; then
      existing="$(readlink "$target")"
      case "$existing" in
        "$src"/*) ln -sfn "$child" "$target"; linked=$((linked + 1)) ;;  # ours, refresh
        *) warn "skip $name ($type): personal symlink exists"; skipped=$((skipped + 1)) ;;
      esac
    elif [ -e "$target" ]; then
      warn "skip $name ($type): a real file/dir already exists"
      skipped=$((skipped + 1))
    else
      ln -sfn "$child" "$target"
      linked=$((linked + 1))
    fi
  done
done

log "done: ${linked} linked, ${skipped} skipped, ${pruned} pruned"
exit 0
