#!/usr/bin/env bash
#
# install-mcp.sh — ลงทะเบียน MCP server ของทีม dobybot ให้ AI client แบบ global
#
# รองรับ 2 client: Claude Code (`claude`) และ Codex CLI (`codex`) — bundle เป็น stdio MCP server
# ตัวเดียวกัน ใช้ได้ทั้งคู่ ต่างกันแค่คำสั่งลงทะเบียน
#
# ตอนนี้มี MCP ตัวเดียว: artemis (ห่อ REST API /api/v1 ของ Artemis · 21 tool)
# bundle ถูก commit ไว้ที่ mcp/<name>/<name>-mcp.mjs — ไม่ต้องมี repo artemis หรือ build เอง
# ลงแบบ global (`claude mcp add --scope user` / `codex mcp add`) → ใช้ได้ทุกโปรเจกต์ ·
# `git pull` อัปเดต bundle ให้เอง
#
# Usage:
#   ./install-mcp.sh                        # ลงให้ทุก client ที่เจอในเครื่อง
#   ./install-mcp.sh --client claude        # เฉพาะ Claude Code
#   ./install-mcp.sh --client codex         # เฉพาะ Codex
#   ARTEMIS_API_TOKEN=… ./install-mcp.sh    # ตั้ง env ล่วงหน้าเพื่อข้ามคำถาม
#
# ถอนออก:  claude mcp remove artemis --scope user   ·   codex mcp remove artemis
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="artemis"
BUNDLE="$REPO/mcp/$NAME/artemis-mcp.mjs"

# ค่าปริยายชี้ prod
DEFAULT_API_URL="https://artemis-actions.dobybot.com"   # โดเมน API/actions (โค้ดเติม /api/v1 เอง)
DEFAULT_SITE_URL="https://artemis.dobybot.com"           # โดเมนหน้าเว็บ — ลิงก์ /browse/{key}

log()  { printf '[install-mcp] %s\n' "$*"; }
warn() { printf '[install-mcp] WARN: %s\n' "$*" >&2; }
die()  { printf '[install-mcp] ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: ./install-mcp.sh [--client claude|codex|all]

  --client claude   ลงให้ Claude Code อย่างเดียว
  --client codex    ลงให้ Codex อย่างเดียว
  --client all      (ค่าปริยาย) ลงให้ทุก client ที่เจอในเครื่อง
  -h, --help        แสดงข้อความนี้
EOF
}

# ---------- อ่าน argument ----------
CLIENT="all"
while [ $# -gt 0 ]; do
  case "$1" in
    --client)    CLIENT="${2:-}"; shift 2 ;;
    --client=*)  CLIENT="${1#*=}"; shift ;;
    -h|--help)   usage; exit 0 ;;
    *)           usage >&2; die "ไม่รู้จักตัวเลือก: $1" ;;
  esac
done
case "$CLIENT" in
  claude|codex|all) ;;
  *) die "--client ต้องเป็น claude, codex หรือ all (ได้: '$CLIENT')" ;;
esac

# ---------- Windows (Git Bash/MSYS2/Cygwin) → มอบงานให้ install-mcp.ps1 ----------
# path ที่ลงทะเบียนกับ client ต้องเป็น Windows path (C:\…) ไม่ใช่ /c/… ของ Git Bash
case "$(uname -s 2>/dev/null || echo unknown)" in
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    ps1="$REPO/install-mcp.ps1"
    if [ -f "$ps1" ] && command -v powershell.exe >/dev/null 2>&1; then
      log "ตรวจพบ Windows — ส่งต่อให้ install-mcp.ps1"
      win_ps1="$(cygpath -w "$ps1" 2>/dev/null || printf '%s' "$ps1")"
      exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$win_ps1" -Client "$CLIENT"
    fi
    die "บน Windows ให้รัน: powershell -ExecutionPolicy Bypass -File .\\install-mcp.ps1"
    ;;
esac

command -v node >/dev/null 2>&1 || die "ไม่พบ node (ต้องใช้ Node 22+)"
[ -f "$BUNDLE" ] || die "ไม่พบ bundle ที่ $BUNDLE — ลอง 'git pull' แล้วรันใหม่"

# ---------- หา client ที่จะลง ----------
DO_CLAUDE=0
DO_CODEX=0
if [ "$CLIENT" = "claude" ] || [ "$CLIENT" = "all" ]; then
  if command -v claude >/dev/null 2>&1; then
    DO_CLAUDE=1
  elif [ "$CLIENT" = "claude" ]; then
    die "ไม่พบคำสั่ง claude (Claude Code CLI) — ติดตั้ง Claude Code ก่อน"
  else
    log "ข้าม Claude Code — ไม่พบคำสั่ง claude ในเครื่อง"
  fi
fi
if [ "$CLIENT" = "codex" ] || [ "$CLIENT" = "all" ]; then
  if command -v codex >/dev/null 2>&1; then
    DO_CODEX=1
  elif [ "$CLIENT" = "codex" ]; then
    die "ไม่พบคำสั่ง codex (Codex CLI) — ติดตั้ง Codex ก่อน: npm i -g @openai/codex"
  else
    log "ข้าม Codex — ไม่พบคำสั่ง codex ในเครื่อง"
  fi
fi
if [ "$((DO_CLAUDE + DO_CODEX))" -eq 0 ]; then
  die "ไม่พบทั้ง claude และ codex ในเครื่อง — ติดตั้ง client อย่างน้อยหนึ่งตัวก่อน"
fi

targets=""
if [ "$DO_CLAUDE" -eq 1 ]; then targets="Claude Code"; fi
if [ "$DO_CODEX"  -eq 1 ]; then targets="${targets:+$targets + }Codex"; fi
log "ลงทะเบียน MCP '$NAME' แบบ global ให้: $targets — ใช้ได้ทุกโปรเจกต์"

# ── ค่าที่จำเป็น ──────────────────────────────────────────────────────────────
API_URL="${ARTEMIS_API_URL:-}"
if [ -z "$API_URL" ]; then
  printf '  ARTEMIS_API_URL [%s]: ' "$DEFAULT_API_URL"
  read -r API_URL || true
  [ -n "$API_URL" ] || API_URL="$DEFAULT_API_URL"
fi
# base ต้องเป็น origin — path ในโค้ดขึ้นต้น /api/v1 อยู่แล้ว จึงตัด /api/v1 + / ท้ายกันซ้ำ
API_URL="${API_URL%/}"; API_URL="${API_URL%/api/v1}"; API_URL="${API_URL%/}"
[ -n "$API_URL" ] || die "ต้องมี ARTEMIS_API_URL"

API_TOKEN="${ARTEMIS_API_TOKEN:-}"
if [ -z "$API_TOKEN" ]; then
  printf '  ARTEMIS_API_TOKEN — สร้างที่ Admin → API Tokens (การพิมพ์จะไม่แสดงผล): '
  read -rs API_TOKEN || true
  echo
fi
[ -n "$API_TOKEN" ] || die "ต้องมี ARTEMIS_API_TOKEN"
if ! printf '%s' "$API_TOKEN" | grep -Eq '^art_[0-9a-f]{64}$'; then
  warn "รูปแบบ token ดูไม่ตรง art_ + hex 64 ตัว — ลงให้อยู่ดี แต่ tool อาจตอบว่า token ผิดรูปแบบ"
fi

PROJECT_KEY="${ARTEMIS_PROJECT_KEY:-}"
SITE_URL="${ARTEMIS_SITE_URL:-}"
if [ -z "${ARTEMIS_PROJECT_KEY+x}" ]; then
  printf '  ARTEMIS_PROJECT_KEY — โปรเจกต์ปริยาย (เว้นว่างได้): '
  read -r PROJECT_KEY || true
fi
if [ -z "${ARTEMIS_SITE_URL+x}" ]; then
  printf '  ARTEMIS_SITE_URL — ใช้ทำลิงก์ /browse/{key} [%s]: ' "$DEFAULT_SITE_URL"
  read -r SITE_URL || true
  [ -n "$SITE_URL" ] || SITE_URL="$DEFAULT_SITE_URL"
fi
SITE_URL="${SITE_URL%/}"

# ── ลงทะเบียน global ─────────────────────────────────────────────────────────
# Claude ใช้ `-e KEY=VAL` + ต้องระบุ --scope user · Codex ใช้ `--env KEY=VAL` (global อยู่แล้ว
# ที่ ~/.codex/config.toml) — นอกนั้นเหมือนกัน: `-- node <bundle>`
if [ "$DO_CLAUDE" -eq 1 ]; then
  claude mcp remove "$NAME" --scope user >/dev/null 2>&1 || true   # ถอนของเดิม (ถ้ามี) เพื่อรันซ้ำได้

  ENV_ARGS=(-e "ARTEMIS_API_URL=$API_URL" -e "ARTEMIS_API_TOKEN=$API_TOKEN")
  if [ -n "$PROJECT_KEY" ]; then ENV_ARGS+=(-e "ARTEMIS_PROJECT_KEY=$PROJECT_KEY"); fi
  if [ -n "$SITE_URL" ];    then ENV_ARGS+=(-e "ARTEMIS_SITE_URL=$SITE_URL");    fi

  claude mcp add "$NAME" --scope user "${ENV_ARGS[@]}" -- node "$BUNDLE" >/dev/null \
    || die "ลงทะเบียนกับ Claude Code ไม่สำเร็จ — ลองมือ: claude mcp add $NAME --scope user -- node \"$BUNDLE\""
  log "✅ Claude Code: ลงทะเบียน '$NAME' ที่ scope user แล้ว"
fi

if [ "$DO_CODEX" -eq 1 ]; then
  codex mcp remove "$NAME" >/dev/null 2>&1 || true                 # ถอนของเดิม (ถ้ามี) เพื่อรันซ้ำได้

  CODEX_ENV_ARGS=(--env "ARTEMIS_API_URL=$API_URL" --env "ARTEMIS_API_TOKEN=$API_TOKEN")
  if [ -n "$PROJECT_KEY" ]; then CODEX_ENV_ARGS+=(--env "ARTEMIS_PROJECT_KEY=$PROJECT_KEY"); fi
  if [ -n "$SITE_URL" ];    then CODEX_ENV_ARGS+=(--env "ARTEMIS_SITE_URL=$SITE_URL");    fi

  codex mcp add "$NAME" "${CODEX_ENV_ARGS[@]}" -- node "$BUNDLE" >/dev/null \
    || die "ลงทะเบียนกับ Codex ไม่สำเร็จ — ลองมือ: codex mcp add $NAME -- node \"$BUNDLE\""
  log "✅ Codex: ลงทะเบียน '$NAME' ใน ~/.codex/config.toml แล้ว"
fi

# ── smoke-test (boot + ลิสต์ tool · ไม่แตะเน็ต ไม่ใช้ token จริง) ──────────────
log "smoke-test: server boot + ลิสต์ tool …"
count="$(
  printf '%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"install","version":"0"}}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node "$BUNDLE" 2>/dev/null \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{let n=0;for(const l of d.trim().split("\n")){try{const j=JSON.parse(l);if(j.id===2&&j.result&&j.result.tools)n=j.result.tools.length;}catch(e){}}process.stdout.write(String(n));})' \
  || true
)"
if [ "${count:-0}" -ge 1 ] 2>/dev/null; then
  log "✅ server boot OK · ลงทะเบียน tool ${count} ตัว"
else
  warn "smoke-test ไม่ผ่าน — ลองมือ: node \"$BUNDLE\""
fi

echo
log "เสร็จแล้ว! restart $targets แล้วลองพิมพ์:  \"list projects ใน artemis\""
log "อัปเดต bundle → git pull แล้ว restart client"
if [ "$DO_CLAUDE" -eq 1 ]; then log "ถอนจาก Claude Code → claude mcp remove $NAME --scope user"; fi
if [ "$DO_CODEX"  -eq 1 ]; then log "ถอนจาก Codex → codex mcp remove $NAME"; fi
