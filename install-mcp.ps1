#Requires -Version 5.1
<#
    install-mcp.ps1 — ลงทะเบียน MCP server ของทีม dobybot ให้ Claude Code/Codex แบบ global (Windows)
    เทียบเท่า install-mcp.sh บน macOS/Linux

    ตอนนี้มีตัวเดียว: artemis (ห่อ REST API /api/v1 ของ Artemis · 21 tool)
    bundle ถูก commit ไว้ที่ mcp\<name>\<name>-mcp.mjs — ไม่ต้องมี repo artemis หรือ build เอง
    ลงด้วย CLI ของ client → ใช้ได้ทุกโปรเจกต์ · `git pull` อัปเดต bundle ให้เอง

    Usage:
      .\install-mcp.ps1                    # ถามว่าจะลงให้ Claude Code, Codex หรือทั้งสอง
      .\install-mcp.ps1 -Target codex      # ลงให้ Codex
      .\install-mcp.ps1 -Both              # ลงให้ทั้ง Claude Code และ Codex
      $env:ARTEMIS_API_TOKEN='art_…'; .\install-mcp.ps1    # ตั้ง env ล่วงหน้าเพื่อข้ามคำถาม

    ถ้าโดน execution policy บล็อก:
      powershell -ExecutionPolicy Bypass -File .\install-mcp.ps1

    ถอนออก:  claude mcp remove artemis --scope user
              codex mcp remove artemis
#>
[CmdletBinding()]
param(
    [ValidateSet('', 'claude', 'codex', 'both')]
    [string]$Target = '',
    [switch]$Claude,
    [switch]$Codex,
    [switch]$Both
)

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

# การไม่มี registration เดิมเป็นสถานะปกติ แต่ Windows PowerShell 5.1 แปลง stderr
# ของ native command เป็น error record ซึ่งจะหยุดสคริปต์เมื่อ ErrorActionPreference = Stop
function Remove-McpRegistration {
    param([string]$Cli, [string[]]$RemovalArgs)
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'SilentlyContinue'
        & $Cli @RemovalArgs 2>$null | Out-Null
    } catch {
        # ลงต่อได้เสมอ ไม่ว่าจะไม่มี registration เดิมหรือ remove ล้มเหลว
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

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

function Resolve-CodexCli {
    $cmd = Get-Command codex -ErrorAction SilentlyContinue
    if ($cmd) { if ($cmd.Source) { return $cmd.Source } else { return 'codex' } }
    foreach ($candidate in @(
        (Join-Path $env:APPDATA 'npm\codex.cmd'),
        (Join-Path $env:APPDATA 'npm\codex.ps1'),
        (Join-Path $env:USERPROFILE '.local\bin\codex.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\codex\codex.exe')
    )) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    return $null
}

if ($Both)       { $Target = 'both' }
elseif ($Codex)  { $Target = 'codex' }
elseif ($Claude) { $Target = 'claude' }

if ($Target) {
    $Target = $Target.Trim().ToLowerInvariant()
} else {
    Write-Host ''
    Write-Host 'เลือกว่าจะติดตั้ง MCP ให้ agent ไหน'
    Write-Host '  1) Claude Code'
    Write-Host '  2) Codex'
    Write-Host '  3) ทั้งสอง'
    Write-Host ''
    $targetReply = ([string](Read-Host 'เลือก [1]')).Trim()
    switch -Regex ($targetReply) {
        '^$'     { $Target = 'claude' }
        '^1$'    { $Target = 'claude' }
        '^2$'    { $Target = 'codex'  }
        '^3$'    { $Target = 'both'   }
        '^[qQ]$' { Write-Log 'cancelled'; exit 0 }
        default  { Stop-Install "ไม่รู้จักตัวเลือก: $targetReply" }
    }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Stop-Install 'ไม่พบ node (ต้องใช้ Node 22+) — ติดตั้งจาก https://nodejs.org แล้วเปิด PowerShell ใหม่'
}
$ClaudeCli = if ($Target -in @('claude', 'both')) { Resolve-ClaudeCli } else { $null }
$CodexCli  = if ($Target -in @('codex', 'both'))  { Resolve-CodexCli  } else { $null }
if ($Target -in @('claude', 'both') -and -not $ClaudeCli) {
    Stop-Install 'ไม่พบคำสั่ง claude (Claude Code CLI) — ติดตั้ง Claude Code ก่อน หรือเปิด PowerShell ใหม่ให้ PATH อัพเดต'
}
if ($Target -in @('codex', 'both') -and -not $CodexCli) {
    Stop-Install 'ไม่พบคำสั่ง codex (Codex CLI) — ติดตั้ง Codex ก่อน หรือเปิด PowerShell ใหม่ให้ PATH อัพเดต'
}
if (-not (Test-Path -LiteralPath $Bundle)) {
    Stop-Install "ไม่พบ bundle ที่ $Bundle — ลอง 'git pull' แล้วรันใหม่"
}

$TargetLabel = switch ($Target) {
    'claude' { 'Claude Code' }
    'codex'  { 'Codex' }
    'both'   { 'Claude Code + Codex' }
}
Write-Log "ลงทะเบียน MCP '$Name' แบบ global ให้ $TargetLabel — ใช้ได้ทุกโปรเจกต์"

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
if ($ClaudeCli) {
    Remove-McpRegistration -Cli $ClaudeCli -RemovalArgs @('mcp', 'remove', $Name, '--scope', 'user')
    $claudeArgs = @('mcp', 'add', $Name, '--scope', 'user',
                    '-e', "ARTEMIS_API_URL=$ApiUrl",
                    '-e', "ARTEMIS_API_TOKEN=$ApiToken")
    if ($ProjectKey) { $claudeArgs += @('-e', "ARTEMIS_PROJECT_KEY=$ProjectKey") }
    if ($SiteUrl)    { $claudeArgs += @('-e', "ARTEMIS_SITE_URL=$SiteUrl") }
    $claudeArgs += @('--', 'node', $Bundle)
    & $ClaudeCli @claudeArgs | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Stop-Install "ลงทะเบียนกับ Claude Code ไม่สำเร็จ — ลองมือ: claude mcp add $Name --scope user -- node `"$Bundle`""
    }
    Write-Log "✅ ลงทะเบียน '$Name' ให้ Claude Code ที่ scope user แล้ว"
}

if ($CodexCli) {
    Remove-McpRegistration -Cli $CodexCli -RemovalArgs @('mcp', 'remove', $Name)
    $codexArgs = @('mcp', 'add', $Name,
                   '--env', "ARTEMIS_API_URL=$ApiUrl",
                   '--env', "ARTEMIS_API_TOKEN=$ApiToken")
    if ($ProjectKey) { $codexArgs += @('--env', "ARTEMIS_PROJECT_KEY=$ProjectKey") }
    if ($SiteUrl)    { $codexArgs += @('--env', "ARTEMIS_SITE_URL=$SiteUrl") }
    $codexArgs += @('--', 'node', $Bundle)
    & $CodexCli @codexArgs | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Stop-Install "ลงทะเบียนกับ Codex ไม่สำเร็จ — ลองมือ: codex mcp add $Name -- node `"$Bundle`""
    }
    Write-Log "✅ ลงทะเบียน '$Name' ให้ Codex แล้ว"
}

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
Write-Log "เสร็จแล้ว! restart $TargetLabel แล้วลองพิมพ์:  `"list projects ใน artemis`""
$RemoveHint = switch ($Target) {
    'claude' { "claude mcp remove $Name --scope user" }
    'codex'  { "codex mcp remove $Name" }
    'both'   { "claude mcp remove $Name --scope user / codex mcp remove $Name" }
}
Write-Log "อัปเดต bundle → git pull แล้ว restart · ถอน → $RemoveHint"
