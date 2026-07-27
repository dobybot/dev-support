#!/usr/bin/env bash
#
# install.sh — interactive per-skill installer for dev-support team skills.
#
# Lists every skill under skills/<group>/ (e.g. skills/in-development/,
# skills/old/) and lets the developer choose which ones to install or update
# into ~/.claude/skills as symlinks. A symlink tracks this clone, so
# `git pull` updates an installed skill's content automatically — re-run this
# script only to add/remove skills, or after a skill moves to another group.
#
# Usage:
#   ./install.sh                 # interactive menu
#   ./install.sh --all           # install/update every skill, no prompt
#   ./install.sh learn-diff ...  # install/update the named skills, no prompt
#
# This replaces the old SessionStart auto-sync mechanism (.agents/sync-skills.sh):
# per-skill selection and sync-everything cannot coexist, so if the legacy hook
# is found in ~/.claude/settings.json it is removed (settings backed up first).
#
# Safe to run repeatedly. Never touches skills it does not own: an existing
# real directory, or a symlink pointing outside this clone, is skipped.

set -euo pipefail
shopt -s nullglob

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_ROOT="$REPO/skills"
DEST="$HOME/.claude/skills"
SETTINGS="$HOME/.claude/settings.json"

log()  { printf '[install] %s\n' "$*"; }
warn() { printf '[install] WARN: %s\n' "$*" >&2; }

# ---------- Windows (Git Bash/MSYS2/Cygwin) → มอบงานให้ install.ps1 ----------
# `ln -s` บน Git Bash คัดลอกโฟลเดอร์แทนการทำ symlink จริง (git pull จะไม่อัพเดตให้อีก)
# install.ps1 สร้าง directory junction จริง — ไม่ต้อง admin, ไม่ต้อง Developer Mode, ไม่ต้องมี jq
case "$(uname -s 2>/dev/null || echo unknown)" in
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    ps1="$REPO/install.ps1"
    if [ -f "$ps1" ] && command -v powershell.exe >/dev/null 2>&1; then
      log "ตรวจพบ Windows — ส่งต่อให้ install.ps1 (สร้าง junction แทน symlink)"
      win_ps1="$(cygpath -w "$ps1" 2>/dev/null || printf '%s' "$ps1")"
      exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$win_ps1" "$@"
    fi
    warn "บน Windows ให้รัน: powershell -ExecutionPolicy Bypass -File .\\install.ps1"
    exit 1
    ;;
esac

[ -d "$SRC_ROOT" ] || { warn "no skills/ directory in $REPO"; exit 1; }
mkdir -p "$DEST"

# ---------- discover: skills/<group>/<name>/SKILL.md ----------
# Parallel indexed arrays (macOS ships bash 3.2 — no associative arrays).
# One declaration per line: bash 3.2 mishandles multiple array assignments on
# one line, and GROUPS is a reserved bash variable — hence GRPS.
NAMES=()
GRPS=()
PATHS=()
STATES=()

for group_dir in "$SRC_ROOT"/*/; do
  group="$(basename "$group_dir")"
  for skill_dir in "$group_dir"*/; do
    [ -f "${skill_dir}SKILL.md" ] || continue
    skill_dir="${skill_dir%/}"
    name="$(basename "$skill_dir")"

    state="not installed"
    link="$DEST/$name"
    if [ -L "$link" ]; then
      current="$(readlink "$link")"
      if [ "$current" = "$skill_dir" ]; then
        state="installed"
      else
        case "$current" in
          "$REPO"/*) state="update available" ;;  # stale path inside this clone
          *)         state="personal — skip"  ;;  # someone else's skill
        esac
      fi
    elif [ -e "$link" ]; then
      state="personal — skip"
    fi

    NAMES+=("$name"); GRPS+=("$group"); PATHS+=("$skill_dir"); STATES+=("$state")
  done
done

count=${#NAMES[@]}
if [ "$count" -eq 0 ]; then
  warn "no skills found under skills/<group>/<name>/SKILL.md"
  exit 1
fi

# ---------- select ----------
SELECTED=()

select_all() {
  local i=0
  while [ "$i" -lt "$count" ]; do SELECTED+=("$i"); i=$((i + 1)); done
}

if [ "$#" -gt 0 ]; then
  if [ "$1" = "--all" ]; then
    select_all
  else
    for want in "$@"; do
      found=""
      i=0
      while [ "$i" -lt "$count" ]; do
        if [ "${NAMES[$i]}" = "$want" ]; then SELECTED+=("$i"); found=1; fi
        i=$((i + 1))
      done
      [ -n "$found" ] || warn "unknown skill: $want"
    done
  fi
else
  echo
  echo "dev-support skills — เลือก skill ที่จะติดตั้ง/อัพเดต"
  echo
  i=0
  while [ "$i" -lt "$count" ]; do
    printf '  %2d) %-30s %-18s [%s]\n' \
      "$((i + 1))" "${NAMES[$i]}" "(${GRPS[$i]})" "${STATES[$i]}"
    i=$((i + 1))
  done
  echo
  printf 'เลือกหมายเลข (คั่นด้วย space เช่น "1 3"), a = ทั้งหมด, q = ยกเลิก: '
  read -r reply
  case "$reply" in
    ""|q|Q) log "cancelled"; exit 0 ;;
    a|A)    select_all ;;
    *)
      for tok in $(printf '%s' "$reply" | tr ',' ' '); do
        case "$tok" in
          *[!0-9]*) warn "ignored: $tok" ;;
          *)
            idx=$((tok - 1))
            if [ "$idx" -ge 0 ] && [ "$idx" -lt "$count" ]; then
              SELECTED+=("$idx")
            else
              warn "ignored: $tok (out of range)"
            fi
            ;;
        esac
      done
      ;;
  esac
fi

if [ "${#SELECTED[@]}" -eq 0 ]; then
  log "nothing selected"
  exit 0
fi

# ---------- install/update selected ----------
installed=0 skipped=0

for idx in "${SELECTED[@]}"; do
  name="${NAMES[$idx]}"
  src="${PATHS[$idx]}"
  link="$DEST/$name"

  if [ -L "$link" ]; then
    current="$(readlink "$link")"
    case "$current" in
      "$REPO"/*)
        ln -sfn "$src" "$link"
        log "linked $name -> ${src#"$REPO"/}"
        installed=$((installed + 1))
        ;;
      *)
        warn "skip $name: personal symlink exists ($current)"
        skipped=$((skipped + 1))
        ;;
    esac
  elif [ -e "$link" ]; then
    warn "skip $name: a real file/dir already exists at $link"
    skipped=$((skipped + 1))
  else
    ln -sfn "$src" "$link"
    log "linked $name -> ${src#"$REPO"/}"
    installed=$((installed + 1))
  fi
done

# ---------- prune broken links that point into this clone ----------
# Covers skills deleted upstream AND links to pre-reorg paths (.agents/skills/...).
pruned=0
for link in "$DEST"/*; do
  [ -L "$link" ] || continue
  case "$(readlink "$link")" in
    "$REPO"/*)
      if [ ! -e "$link" ]; then
        rm -f "$link"
        log "pruned broken link: $(basename "$link")"
        pruned=$((pruned + 1))
      fi
      ;;
  esac
done

# ---------- remove legacy auto-sync SessionStart hook ----------
if [ -f "$SETTINGS" ] && grep -q 'sync-skills\.sh' "$SETTINGS"; then
  if command -v jq >/dev/null 2>&1; then
    backup="$SETTINGS.bak.$$"
    cp "$SETTINGS" "$backup"
    tmp="$(mktemp)"
    # The old install.sh wrote a top-level .SessionStart; handle .hooks.SessionStart too.
    jq '
      def strip: map(select(([.hooks[].command] | any(endswith("sync-skills.sh"))) | not));
      (if (.SessionStart? // null) != null then .SessionStart |= strip else . end)
      | (if ((.hooks? // {}) | .SessionStart? // null) != null then .hooks.SessionStart |= strip else . end)
      | (if (.SessionStart? // null) == [] then del(.SessionStart) else . end)
      | (if ((.hooks? // {}) | .SessionStart? // null) == [] then del(.hooks.SessionStart) else . end)
    ' "$SETTINGS" > "$tmp"
    jq -e . "$tmp" >/dev/null
    mv "$tmp" "$SETTINGS"
    log "removed legacy sync-skills SessionStart hook (backup: $backup)"
  else
    warn "legacy sync-skills hook found in $SETTINGS — install jq (brew install jq) and re-run to remove it"
  fi
fi

echo
log "done: ${installed} linked, ${skipped} skipped, ${pruned} pruned"
log "restart Claude Code to pick up changes; 'git pull' keeps installed skills up to date"
