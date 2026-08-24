#Requires -Version 5.1
<#
    install.ps1 — ตัวติดตั้ง skill ของทีม dobybot สำหรับ Windows (คู่ขนานกับ install.sh บน macOS/Linux)

    ลิสต์ทุก skill ใต้ skills\<group>\ แล้วให้เลือกว่าจะติดตั้ง/อัพเดตตัวไหนเข้าโฟลเดอร์ skill
    ของ agent ที่เลือก — Claude Code (%USERPROFILE%\.claude\skills), Codex
    (%USERPROFILE%\.codex\skills) หรือทั้งสอง — โดยสร้างเป็น **directory junction** ชี้กลับมาที่
    clone นี้ (junction สร้างได้โดยไม่ต้องเป็น admin และไม่ต้องเปิด Developer Mode ต่างจาก symlink)
    เมื่อเป็น junction แล้ว `git pull` จะอัพเดตเนื้อ skill ให้เอง — รันสคริปต์นี้ซ้ำเฉพาะตอน
    เพิ่ม/ถอด skill หรือเมื่อ skill ย้ายกลุ่ม

    Usage:
      .\install.ps1                      # เมนูเลือก (ถาม agent ก่อน แล้วค่อยเลือก skill)
      .\install.ps1 -All                 # ติดตั้ง/อัพเดตทุก skill ไม่ถาม
      .\install.ps1 learn-diff better-review   # ระบุชื่อ ไม่ถาม
      .\install.ps1 -Target codex -All   # ปลายทาง: claude (default) | codex | both
      .\install.ps1 -Codex learn-diff    # ทางลัดของ -Target codex (มี -Claude/-Both ด้วย)

    ถ้าโดน execution policy บล็อก ให้รันแบบนี้:
      powershell -ExecutionPolicy Bypass -File .\install.ps1

    ปลอดภัยเมื่อรันซ้ำ และไม่แตะ skill ที่ไม่ได้เป็นของ repo นี้ (โฟลเดอร์จริง หรือ link
    ที่ชี้ออกนอก clone จะถูกข้าม)

    skill บางตัวมี node app มาด้วย (เช่น viewer ของ learn-diff) — หลัง link เสร็จ ทุก
    package.json ในโฟลเดอร์ skill (ที่ root หรือในโฟลเดอร์ย่อยชั้นเดียว) จะถูกติดตั้ง
    dependency ด้วย pnpm (fallback เป็น npm ถ้าไม่มี pnpm) · ถ้าไม่มี node หรือ node เก่าเกินไป
    จะ fail แบบชัดเจนพร้อมวิธีติดตั้ง ไม่ทำงานต่อแบบครึ่ง ๆ กลาง ๆ
#>
[CmdletBinding()]
param(
    [switch]$All,
    [string]$Target,
    [switch]$Claude,
    [switch]$Codex,
    [switch]$Both,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Skill
)

$ErrorActionPreference = 'Stop'
# ให้ข้อความไทยอ่านออกเมื่อรันผ่าน Git Bash/Windows Terminal (console เดิมเป็น ANSI codepage)
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$Repo        = $PSScriptRoot
$SrcRoot     = Join-Path $Repo 'skills'
$ClaudeHome  = Join-Path $env:USERPROFILE '.claude'
$CodexHome   = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
$ClaudeDest  = Join-Path $ClaudeHome 'skills'
$CodexDest   = Join-Path $CodexHome  'skills'
$SettingsPath = Join-Path $ClaudeHome 'settings.json'

function Write-Log  { param([string]$Message) Write-Host "[install] $Message" }
function Write-Warn { param([string]$Message) Write-Host "[install] WARN: $Message" -ForegroundColor Yellow }
function Stop-Install { param([string]$Message) Write-Host "[install] ERROR: $Message" -ForegroundColor Red; exit 1 }

function Get-NormalPath {
    param([string]$Path)
    if (-not $Path) { return $null }
    try { return ([System.IO.Path]::GetFullPath($Path)).TrimEnd('\') } catch { return $Path.TrimEnd('\') }
}

# อ่านปลายทางของ junction/symlink — PowerShell 5.1 ให้ .Target มาอยู่แล้วในเกือบทุกเครื่อง
# ส่วน fallback ไว้เผื่อ Windows/PS รุ่นที่ไม่เติม .Target ให้ junction
function Get-LinkTarget {
    param([string]$Path)
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if (-not $item) { return $null }
    if (-not ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { return $null }

    $target = $item.Target
    if ($target) {
        if ($target -is [array]) { $target = $target[0] }
        return (Get-NormalPath ($target -replace '^\\\\\?\?\\', ''))
    }

    try {
        $parent = Split-Path -Parent $Path
        $leaf   = Split-Path -Leaf   $Path
        $lines  = cmd /c dir /a:l """$parent"""
        foreach ($line in $lines) {
            if ($line -match [regex]::Escape($leaf) -and $line -match '\[(.+)\]') {
                return (Get-NormalPath $Matches[1])
            }
        }
    } catch { }
    return $null
}

function Remove-Link {
    param([string]$Path)
    # ใช้ .Delete() ไม่ใช่ Remove-Item -Recurse — PS 5.1 อาจไล่ลบ "ของจริง" ที่ปลาย junction
    (Get-Item -LiteralPath $Path -Force).Delete()
}

function New-SkillLink {
    param([string]$Link, [string]$Target)
    if (Test-Path -LiteralPath $Link) { Remove-Link $Link }
    try {
        New-Item -ItemType Junction -Path $Link -Target $Target -ErrorAction Stop | Out-Null
    } catch {
        # junction ใช้ไม่ได้ (เช่น repo อยู่บน network drive) — ลอง symlink (ต้องมี Developer Mode/admin)
        New-Item -ItemType SymbolicLink -Path $Link -Target $Target -ErrorAction Stop | Out-Null
    }
}

if (-not (Test-Path -LiteralPath $SrcRoot)) { Stop-Install "ไม่พบโฟลเดอร์ skills\ ใน $Repo" }

# ---------- normalize args: --all / --target ... / ชื่อ skill ----------
# รับรูปแบบเดียวกับ install.sh ด้วย เผื่อคนก๊อปคำสั่งจากเอกสารฝั่ง macOS/Linux มาวาง
$args_ = @($Skill | Where-Object { $_ })
if ($args_ -contains '--all' -or $args_ -contains '-all' -or $args_ -contains 'all') {
    $All = $true
    $args_ = @($args_ | Where-Object { $_ -notin @('--all', '-all', 'all') })
}

$rest = @()
for ($i = 0; $i -lt $args_.Count; $i++) {
    switch -Regex ($args_[$i]) {
        '^--?target$'   { if ($i + 1 -ge $args_.Count) { Stop-Install '--target ต้องตามด้วย claude, codex หรือ both' }
                          $Target = $args_[$i + 1]; $i++ }
        '^--?target=(.+)$' { $Target = $Matches[1] }
        '^--?claude$'   { $Target = 'claude' }
        '^--?codex$'    { $Target = 'codex'  }
        '^--?both$'     { $Target = 'both'   }
        default         { $rest += $args_[$i] }
    }
}
$args_ = @($rest)

# ---------- ปลายทาง: Claude Code / Codex / ทั้งสอง ----------
# skill ตัวเดียวกันใช้ได้ทั้งคู่ (ทั้งคู่อ่าน SKILL.md จากโฟลเดอร์ skill ของตัวเอง)
# — ต่างกันแค่ที่วาง junction
if ($Both)        { $Target = 'both'   }
elseif ($Codex)   { $Target = 'codex'  }
elseif ($Claude)  { $Target = 'claude' }

if ($Target) {
    $Target = $Target.Trim().ToLower()
    if ($Target -notin @('claude', 'codex', 'both')) {
        Stop-Install "ไม่รู้จัก -Target: $Target (ใช้ได้: claude, codex, both)"
    }
} elseif (-not $All -and $args_.Count -eq 0) {
    Write-Host ''
    Write-Host 'ติดตั้ง skill เข้า agent ตัวไหน'
    Write-Host "  1) Claude Code  ($ClaudeDest)"
    Write-Host "  2) Codex        ($CodexDest)"
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
} else {
    $Target = 'claude'   # โหมดสั่งตรงแบบไม่ระบุปลายทาง = พฤติกรรมเดิม
}

switch ($Target) {
    'claude' { $TargetLabel = 'Claude Code';          $TargetDirs = @($ClaudeDest) }
    'codex'  { $TargetLabel = 'Codex';                $TargetDirs = @($CodexDest)  }
    'both'   { $TargetLabel = 'Claude Code + Codex';  $TargetDirs = @($ClaudeDest, $CodexDest) }
}
foreach ($dir in $TargetDirs) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
Write-Log "ปลายทาง: $TargetLabel"
foreach ($dir in $TargetDirs) { Write-Log "  $dir" }

# ---------- discover: skills\<group>\<name>\SKILL.md ----------
# สถานะของ skill หนึ่งตัวในปลายทางหนึ่งที่
function Get-SkillState {
    param([string]$Dest, [string]$SkillPath)
    $link = Join-Path $Dest (Split-Path -Leaf $SkillPath)
    if (-not (Test-Path -LiteralPath $link)) { return 'not installed' }

    $current = Get-LinkTarget $link
    if ($null -eq $current) { return 'personal — skip' }          # โฟลเดอร์/ไฟล์จริงของผู้ใช้เอง
    if ($current -eq (Get-NormalPath $SkillPath)) { return 'installed' }
    if ($current -like ((Get-NormalPath $Repo) + '\*')) { return 'update available' }  # path เก่าใน clone นี้
    return 'personal — skip'                                      # link ของคนอื่น/ที่อื่น
}

$found = @()
foreach ($groupDir in Get-ChildItem -LiteralPath $SrcRoot -Directory) {
    foreach ($skillDir in Get-ChildItem -LiteralPath $groupDir.FullName -Directory) {
        if (-not (Test-Path -LiteralPath (Join-Path $skillDir.FullName 'SKILL.md'))) { continue }

        $path = Get-NormalPath $skillDir.FullName

        # หลายปลายทางแล้วสถานะไม่ตรงกัน = "บางปลายทาง" (เช่น ลง Claude ไว้แล้ว แต่ Codex ยัง)
        $state = $null
        foreach ($dir in $TargetDirs) {
            $s = Get-SkillState -Dest $dir -SkillPath $path
            if ($null -eq $state) { $state = $s } elseif ($state -ne $s) { $state = 'บางปลายทาง' }
        }

        $found += [pscustomobject]@{
            Name  = $skillDir.Name
            Group = $groupDir.Name
            Path  = $path
            State = $state
        }
    }
}

if ($found.Count -eq 0) { Stop-Install "ไม่พบ skill ใต้ skills\<group>\<name>\SKILL.md" }

# ---------- select ----------
$selected = @()
if ($All) {
    $selected = $found
} elseif ($args_.Count -gt 0) {
    foreach ($want in $args_) {
        $hits = @($found | Where-Object { $_.Name -eq $want })
        if ($hits.Count -eq 0) { Write-Warn "ไม่รู้จัก skill: $want" } else { $selected += $hits }
    }
} else {
    Write-Host ''
    Write-Host "dev-support skills — เลือก skill ที่จะติดตั้ง/อัพเดตเข้า $TargetLabel"
    Write-Host ''
    for ($i = 0; $i -lt $found.Count; $i++) {
        Write-Host ('  {0,2}) {1,-30} {2,-18} [{3}]' -f ($i + 1), $found[$i].Name, "($($found[$i].Group))", $found[$i].State)
    }
    Write-Host ''
    $reply = Read-Host 'เลือกหมายเลข (คั่นด้วย space เช่น "1 3"), a = ทั้งหมด, q = ยกเลิก'
    if ($null -eq $reply) { $reply = '' }
    switch -Regex ($reply.Trim()) {
        '^$'      { Write-Log 'cancelled'; exit 0 }
        '^[qQ]$'  { Write-Log 'cancelled'; exit 0 }
        '^[aA]$'  { $selected = $found }
        default {
            foreach ($token in ($reply -split '[,\s]+' | Where-Object { $_ })) {
                if ($token -notmatch '^\d+$') { Write-Warn "ข้าม: $token"; continue }
                $idx = [int]$token - 1
                if ($idx -ge 0 -and $idx -lt $found.Count) { $selected += $found[$idx] }
                else { Write-Warn "ข้าม: $token (เกินช่วง)" }
            }
        }
    }
}

if ($selected.Count -eq 0) { Write-Log 'ไม่ได้เลือกอะไรเลย'; exit 0 }

# ---------- install/update selected ----------
$installed = 0; $skipped = 0; $pruned = 0
$repoNorm  = Get-NormalPath $Repo
$linked    = @()   # skill ที่ link สำเร็จจริง — ใช้ต่อในขั้นติดตั้ง dependency ข้างล่าง

foreach ($item in $selected) {
    $linkedAnywhere = $false

    foreach ($dir in $TargetDirs) {
        $link = Join-Path $dir $item.Name

        if ((Test-Path -LiteralPath $link)) {
            $current = Get-LinkTarget $link
            if ($null -eq $current) {
                Write-Warn "ข้าม $($item.Name): มีโฟลเดอร์/ไฟล์จริงอยู่แล้วที่ $link"
                if (Test-Path -LiteralPath (Join-Path $link 'SKILL.md')) {
                    # เคสที่เจอบ่อยบน Windows: เคยรัน install.sh ผ่าน Git Bash — ln -s กลายเป็นการ copy
                    Write-Warn "  ถ้านี่คือสำเนาที่เกิดจากรัน install.sh ผ่าน Git Bash ให้ลบทิ้งแล้วรันสคริปต์นี้ใหม่:"
                    Write-Warn "    Remove-Item -Recurse -Force `"$link`""
                }
                $skipped++; continue
            }
            if (-not ($current -like "$repoNorm\*")) {
                Write-Warn "ข้าม $($item.Name): มี link ส่วนตัวอยู่แล้ว ($current)"
                $skipped++; continue
            }
        }
        try {
            New-SkillLink -Link $link -Target $item.Path
            Write-Log "linked $($item.Name) -> $($item.Path.Substring($repoNorm.Length + 1))  ($dir)"
            $installed++
            $linkedAnywhere = $true
        } catch {
            Write-Warn "ข้าม $($item.Name): สร้าง link ไม่สำเร็จ — $($_.Exception.Message)"
            $skipped++
        }
    }

    # dependency ติดตั้งที่ source — ครั้งเดียวต่อ skill ไม่ว่าจะ link กี่ปลายทาง
    if ($linkedAnywhere) { $linked += $item }
}

# ---------- ติดตั้ง node dependency ให้ skill ที่มี node app ----------
# กฎกลาง ไม่ผูกกับ skill ตัวใดตัวหนึ่ง: หลัง link เสร็จ ทุก package.json ในโฟลเดอร์ skill
# (ที่ root หรือในโฟลเดอร์ย่อยชั้นเดียว เช่น learn-diff\viewer\) จะถูก pnpm install
# — ไม่มี pnpm ค่อย fallback เป็น npm · ไม่มี node / node เก่าเกินไป = fail ชัดเจนพร้อมวิธีแก้
$NodeMinMajor = 20
$PnpmMinMajor = 9
$PkgMgr       = $null    # resolve ครั้งเดียว ตอนเจอ skill ตัวแรกที่ต้องใช้
$depsFailed   = $false

function Show-ToolchainHint {
    param([string]$SkillName)
    Write-Warn "  ต้องการ: node >= $NodeMinMajor และ pnpm >= $PnpmMinMajor (หรือ npm ที่มากับ node)"
    Write-Warn "  ติดตั้ง node: https://nodejs.org  (winget install OpenJS.NodeJS.LTS)"
    Write-Warn "  ติดตั้ง pnpm: npm install -g pnpm  (หรือ corepack enable pnpm)"
    Write-Warn "  แล้วรัน .\install.ps1 $SkillName อีกครั้ง"
}

# คืนชื่อ package manager ('pnpm'/'npm') ถ้าใช้ได้ · คืน $null ถ้าขาด toolchain
function Resolve-PackageManager {
    param([string]$SkillName)

    # local ต่อ function — `node -v` ที่เขียน stderr ไม่ควรทำให้ทั้งสคริปต์ตาย
    $ErrorActionPreference = 'Continue'

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Warn "ไม่พบ node — ติดตั้ง dependency ของ skill '$SkillName' ไม่ได้"
        Show-ToolchainHint $SkillName
        return $null
    }

    $nodeVer = ''
    try { $nodeVer = (& node -v 2>$null | Select-Object -First 1) } catch { $nodeVer = '' }
    $match = [regex]::Match([string]$nodeVer, '^v?(\d+)')
    $nodeMajor = 0
    if ($match.Success) { $nodeMajor = [int]$match.Groups[1].Value }
    if ($nodeMajor -lt $NodeMinMajor) {
        Write-Warn "node $nodeVer เก่าเกินไป — ติดตั้ง dependency ของ skill '$SkillName' ไม่ได้"
        Show-ToolchainHint $SkillName
        return $null
    }

    if (Get-Command pnpm -ErrorAction SilentlyContinue) { return 'pnpm' }
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        Write-Warn 'ไม่พบ pnpm — ใช้ npm แทน (แนะนำให้ลง pnpm: npm install -g pnpm)'
        return 'npm'
    }

    Write-Warn "ไม่พบทั้ง pnpm และ npm — ติดตั้ง dependency ของ skill '$SkillName' ไม่ได้"
    Show-ToolchainHint $SkillName
    return $null
}

# package.json ที่ root ของ skill + ที่โฟลเดอร์ย่อยชั้นเดียว (ข้าม node_modules และโฟลเดอร์ที่ขึ้นต้นด้วย .)
function Get-PackageDir {
    param([string]$SkillPath)
    $dirs = @()
    if (Test-Path -LiteralPath (Join-Path $SkillPath 'package.json')) { $dirs += $SkillPath }
    foreach ($sub in (Get-ChildItem -LiteralPath $SkillPath -Directory -ErrorAction SilentlyContinue)) {
        if ($sub.Name -eq 'node_modules' -or $sub.Name.StartsWith('.')) { continue }
        if (Test-Path -LiteralPath (Join-Path $sub.FullName 'package.json')) { $dirs += $sub.FullName }
    }
    return $dirs
}

foreach ($item in $linked) {
    $pkgDirs = @(Get-PackageDir $item.Path)
    if ($pkgDirs.Count -eq 0) { continue }

    if (-not $PkgMgr) { $PkgMgr = Resolve-PackageManager $item.Name }
    if (-not $PkgMgr) { $depsFailed = $true; continue }

    foreach ($pkgDir in $pkgDirs) {
        $shown = $pkgDir
        if ($shown.StartsWith("$repoNorm\")) { $shown = $shown.Substring($repoNorm.Length + 1) }
        Write-Log "$($item.Name): $PkgMgr install ใน $shown"
        Push-Location -LiteralPath $pkgDir
        try {
            # ปิด $ErrorActionPreference='Stop' ชั่วคราว — คำสั่งภายนอกที่ exit code ไม่ใช่ 0
            # ไม่ควรทำให้สคริปต์ตายกลางทาง เราจัดการเองด้วย $LASTEXITCODE
            $prevEap = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            $global:LASTEXITCODE = 0
            & $PkgMgr 'install'
            $code = $LASTEXITCODE
            $ErrorActionPreference = $prevEap
            if ($code -ne 0) {
                Write-Warn "$($item.Name): $PkgMgr install ล้มเหลวที่ $shown (exit $code)"
                $depsFailed = $true
            }
        } catch {
            Write-Warn "$($item.Name): $PkgMgr install ล้มเหลวที่ $shown — $($_.Exception.Message)"
            $depsFailed = $true
        } finally {
            $ErrorActionPreference = 'Stop'
            Pop-Location
        }
    }
}

# ---------- prune link ที่ชี้เข้า clone นี้แต่ปลายทางหายไปแล้ว ----------
foreach ($dir in $TargetDirs) {
    foreach ($entry in Get-ChildItem -LiteralPath $dir -Force) {
        $target = Get-LinkTarget $entry.FullName
        if ($null -eq $target) { continue }
        if (-not ($target -like "$repoNorm\*")) { continue }
        if (Test-Path -LiteralPath $target) { continue }
        Remove-Link $entry.FullName
        Write-Log "pruned broken link: $($entry.Name)  ($dir)"
        $pruned++
    }
}

# ---------- ถอด SessionStart hook ของระบบ auto-sync เดิม ----------
# เป็นกลไกของ Claude Code เท่านั้น — ทำเฉพาะตอนปลายทางมี claude
if ($Target -ne 'codex' -and (Test-Path -LiteralPath $SettingsPath)) {
    $raw = Get-Content -LiteralPath $SettingsPath -Raw
    if ($raw -match 'sync-skills\.(sh|ps1)') {
        try {
            $json    = $raw | ConvertFrom-Json
            $changed = $false
            foreach ($holder in @($json, $json.hooks)) {
                if (-not $holder) { continue }
                $prop = $holder.PSObject.Properties['SessionStart']
                if (-not $prop) { continue }
                $entries = @($prop.Value)
                $kept = @($entries | Where-Object {
                    $cmds = @($_.hooks | ForEach-Object { $_.command })
                    -not ($cmds | Where-Object { $_ -match 'sync-skills\.(sh|ps1)' })
                })
                if ($kept.Count -eq $entries.Count) { continue }
                $changed = $true
                if ($kept.Count -eq 0) { $holder.PSObject.Properties.Remove('SessionStart') }
                else { $holder.SessionStart = $kept }
            }
            if ($changed) {
                $backup = "$SettingsPath.bak.$PID"
                Copy-Item -LiteralPath $SettingsPath -Destination $backup
                $out = $json | ConvertTo-Json -Depth 100
                # เขียนแบบ UTF-8 ไม่มี BOM — settings.json ที่มี BOM จะ parse ไม่ผ่าน
                [System.IO.File]::WriteAllText($SettingsPath, $out, (New-Object System.Text.UTF8Encoding($false)))
                Write-Log "ถอด SessionStart hook ของ sync-skills เดิมออกแล้ว (backup: $backup)"
            }
        } catch {
            Write-Warn "เจอ hook sync-skills เดิมใน $SettingsPath แต่แก้อัตโนมัติไม่ได้ ($($_.Exception.Message)) — ลบ entry นั้นเองได้เลย"
        }
    }
}

Write-Host ''
Write-Log "done: $installed linked, $skipped skipped, $pruned pruned"
Write-Log "restart $TargetLabel เพื่อให้เห็นการเปลี่ยนแปลง · 'git pull' อัพเดต skill ที่ติดตั้งไว้ให้เอง"

if ($depsFailed) {
    Write-Host ''
    Write-Warn 'skill ถูก link แล้ว แต่ dependency ยังติดตั้งไม่ครบ — skill ที่ต้องใช้ node จะยังรันไม่ได้'
    exit 1
}
