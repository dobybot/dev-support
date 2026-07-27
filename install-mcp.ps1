#Requires -Version 5.1
<#
    install-mcp.ps1 — ลงทะเบียน MCP server ของทีม dobybot ให้ Claude Code แบบ global (Windows)
    เทียบเท่า install-mcp.sh บน macOS/Linux

    ตอนนี้มีตัวเดียว: artemis (ห่อ REST API /api/v1 ของ Artemis · 21 tool)
    bundle ถูก commit ไว้ที่ mcp\<name>\<name>-mcp.mjs — ไม่ต้องมี repo artemis หรือ build เอง
    ลงด้วย `claude mcp add --scope user` → ใช้ได้ทุกโปรเจกต์ · `git pull` อัปเดต bundle ให้เอง

    Usage:
      .\install-mcp.ps1                    # ลง artemis (ถามค่าที่จำเป็น)
      $env:ARTEMIS_API_TOKEN='art_…'; .\install-mcp.ps1    # ตั้ง env ล่วงหน้าเพื่อข้ามคำถาม

    ถ้าโดน execution policy บล็อก:
      powershell -ExecutionPolicy Bypass -File .\install-mcp.ps1

    ถอนออก:  claude mcp remove artemis --scope user
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
# ให้ข้อความไทยอ่านออกเมื่อรันผ่าน Git Bash/Windows Terminal (console เดิมเป็น ANSI codepage)
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$Repo   = $PSScriptRoot
$Name   = 'artemis'
$Bundle = Join-Path $Repo "mcp\$Name\artemis-mcp.mjs"

# ค่าปริยายชี้ prod
$DefaultApiUrl  = 'https://artemis-actions.dobybot.com'   # โดเมน API/actions (โค้ดเติม /api/v1 เอง)
$DefaultSiteUrl = 'https://artemis.dobybot.com'           # โดเมนหน้าเว็บ — ลิงก์ /browse/{key}

function Write-Log  { param([string]$Message) Write-Host "[install-mcp] $Message" }
function Write-Warn { param([string]$Message) Write-Host "[install-mcp] WARN: $Message" -ForegroundColor Yellow }
function Stop-Install { param([string]$Message) Write-Host "[install-mcp] ERROR: $Message" -ForegroundColor Red; exit 1 }

# หา CLI `claude` — บาง PowerShell session ยังไม่มี PATH ของ installer จึงเดาที่ติดตั้งมาตรฐานให้ด้วย
function Resolve-ClaudeCli {
    $cmd = Get-Command claude -ErrorAction SilentlyContinue
    if ($cmd) { if ($cmd.Source) { return $cmd.Source } else { return 'claude' } }
    foreach ($candidate in @(
        (Join-Path $env:USERPROFILE '.local\bin\claude.exe'),
        (Join-Path $env:USERPROFILE '.local\bin\claude.cmd'),
        (Join-Path $env:APPDATA    'npm\claude.cmd'),
        (Join-Path $env:LOCALAPPDATA 'Programs\claude\claude.exe')
    )) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    return $null
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Stop-Install 'ไม่พบ node (ต้องใช้ Node 22+) — ติดตั้งจาก https://nodejs.org แล้วเปิด PowerShell ใหม่'
}
$Claude = Resolve-ClaudeCli
if (-not $Claude) {
    Stop-Install 'ไม่พบคำสั่ง claude (Claude Code CLI) — ติดตั้ง Claude Code ก่อน หรือเปิด PowerShell ใหม่ให้ PATH อัพเดต'
}
if (-not (Test-Path -LiteralPath $Bundle)) {
    Stop-Install "ไม่พบ bundle ที่ $Bundle — ลอง 'git pull' แล้วรันใหม่"
}

Write-Log "ลงทะเบียน MCP '$Name' แบบ global (scope user) — ใช้ได้ทุกโปรเจกต์"

# ── ค่าที่จำเป็น ──────────────────────────────────────────────────────────────
$ApiUrl = $env:ARTEMIS_API_URL
if (-not $ApiUrl) {
    $ApiUrl = Read-Host "  ARTEMIS_API_URL [$DefaultApiUrl]"
    if (-not $ApiUrl) { $ApiUrl = $DefaultApiUrl }
}
# base ต้องเป็น origin — path ในโค้ดขึ้นต้น /api/v1 อยู่แล้ว จึงตัด /api/v1 + / ท้ายกันซ้ำ
$ApiUrl = $ApiUrl.Trim().TrimEnd('/')
if ($ApiUrl.EndsWith('/api/v1')) { $ApiUrl = $ApiUrl.Substring(0, $ApiUrl.Length - 7).TrimEnd('/') }
if (-not $ApiUrl) { Stop-Install 'ต้องมี ARTEMIS_API_URL' }

$ApiToken = $env:ARTEMIS_API_TOKEN
if (-not $ApiToken) {
    $secure = Read-Host '  ARTEMIS_API_TOKEN — สร้างที่ Admin → API Tokens (การพิมพ์จะไม่แสดงผล)' -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try   { $ApiToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
    finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
if (-not $ApiToken) { Stop-Install 'ต้องมี ARTEMIS_API_TOKEN' }
if ($ApiToken -notmatch '^art_[0-9a-f]{64}$') {
    Write-Warn 'รูปแบบ token ดูไม่ตรง art_ + hex 64 ตัว — ลงให้อยู่ดี แต่ tool อาจตอบว่า token ผิดรูปแบบ'
}

$ProjectKey = $env:ARTEMIS_PROJECT_KEY
if ($null -eq $ProjectKey) {
    $ProjectKey = Read-Host '  ARTEMIS_PROJECT_KEY — โปรเจกต์ปริยาย (เว้นว่างได้)'
}
$SiteUrl = $env:ARTEMIS_SITE_URL
if ($null -eq $SiteUrl) {
    $SiteUrl = Read-Host "  ARTEMIS_SITE_URL — ใช้ทำลิงก์ /browse/{key} [$DefaultSiteUrl]"
    if (-not $SiteUrl) { $SiteUrl = $DefaultSiteUrl }
}
if ($SiteUrl) { $SiteUrl = $SiteUrl.Trim().TrimEnd('/') }

# ── ลงทะเบียน global ─────────────────────────────────────────────────────────
try { & $Claude mcp remove $Name --scope user | Out-Null } catch { }   # ถอนของเดิม (ถ้ามี) เพื่อรันซ้ำได้

$mcpArgs = @('mcp', 'add', $Name, '--scope', 'user',
             '-e', "ARTEMIS_API_URL=$ApiUrl",
             '-e', "ARTEMIS_API_TOKEN=$ApiToken")
if ($ProjectKey) { $mcpArgs += @('-e', "ARTEMIS_PROJECT_KEY=$ProjectKey") }
if ($SiteUrl)    { $mcpArgs += @('-e', "ARTEMIS_SITE_URL=$SiteUrl") }
$mcpArgs += @('--', 'node', $Bundle)

& $Claude @mcpArgs | Out-Null
if ($LASTEXITCODE -ne 0) {
    Stop-Install "ลงทะเบียนไม่สำเร็จ — ลองมือ: claude mcp add $Name --scope user -- node `"$Bundle`""
}
Write-Log "✅ ลงทะเบียน '$Name' ที่ scope user แล้ว"

# ── smoke-test (boot + ลิสต์ tool · ไม่แตะเน็ต ไม่ใช้ token จริง) ──────────────
Write-Log 'smoke-test: server boot + ลิสต์ tool …'
$toolCount = 0
try {
    $requests = @(
        '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"install","version":"0"}}}',
        '{"jsonrpc":"2.0","method":"notifications/initialized"}',
        '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
    )
    $lines = $requests | & node $Bundle
    foreach ($line in $lines) {
        try {
            $msg = $line | ConvertFrom-Json
            if ($msg.id -eq 2 -and $msg.result -and $msg.result.tools) {
                $toolCount = @($msg.result.tools).Count
            }
        } catch { }
    }
} catch { }

if ($toolCount -ge 1) {
    Write-Log "✅ server boot OK · ลงทะเบียน tool $toolCount ตัว"
} else {
    Write-Warn "smoke-test ไม่ผ่าน — ลองมือ: node `"$Bundle`""
}

Write-Host ''
Write-Log 'เสร็จแล้ว! restart Claude Code แล้วลองพิมพ์:  "list projects ใน artemis"'
Write-Log "อัปเดต bundle → git pull แล้ว restart · ถอน → claude mcp remove $Name --scope user"
