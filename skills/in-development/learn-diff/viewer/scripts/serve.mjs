#!/usr/bin/env node
/**
 * เปิด viewer ให้พร้อมอ่าน — ทางเข้าเดียวที่ skill เรียกก่อนพิมพ์ URL ให้ผู้ใช้
 *
 *   node scripts/serve.mjs              # มีอยู่แล้วใช้ต่อ ไม่มีค่อยสั่งรัน
 *   node scripts/serve.mjs --json       # ตอบเป็น JSON บรรทัดเดียว (ให้ skill อ่าน)
 *   node scripts/serve.mjs --probe      # ถามอย่างเดียวว่ามีใครรันอยู่ไหม ไม่สั่งรัน
 *   node scripts/serve.mjs --stop       # สั่งตัวที่รันอยู่ให้ปิด
 *
 * กติกาของ SPEC-v3: เครื่องหนึ่งมี server ตัวเดียว พอร์ตเดียว ตัวจับเวลาว่างตัวเดียว
 * (user story 41) — สคริปต์นี้จึงถาม `/api/health` ก่อนเสมอ แล้วค่อยตัดสินใจ
 *
 * exit code: 0 = พร้อมใช้ (รันใหม่หรือของเดิมก็ได้) · 1 = ทำให้พร้อมไม่ได้ ·
 *            3 = `--probe` แล้วไม่มีใครรันอยู่
 */
import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VIEWER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_PORT = 5174
const HOST = '127.0.0.1'
const SERVICE = 'learn-diff-viewer'
/** ลายเซ็นของ dependency ที่ติดตั้งไว้ — เทียบกับ lockfile ทุกครั้งที่สั่งรัน (user story 37) */
const DEPS_STAMP = path.join(VIEWER_ROOT, 'node_modules', '.learn-diff-deps.json')

function parseArgs(argv) {
  const args = { flags: new Set() }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      args.flags.add(key)
    } else {
      args[key] = next
      i += 1
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const asJson = args.flags.has('json')
const port = Number(args.port ?? process.env.LEARN_DIFF_PORT ?? DEFAULT_PORT)
const url = `http://${HOST}:${port}`
const waitSeconds = Number(args.timeout ?? 90)

function homeDir() {
  return process.env.LEARN_DIFF_HOME
    ? path.resolve(process.env.LEARN_DIFF_HOME)
    : path.join(os.homedir(), '.claude', 'learn-diff')
}

/** คำสั่งที่ผู้อ่านก็อปไปสั่งรันเองได้ — ต่างกันต่อ platform (path ของ Windows มี space ประจำ) */
function startCommand() {
  const quoted =
    process.platform === 'win32' || VIEWER_ROOT.includes(' ') ? `"${VIEWER_ROOT}"` : VIEWER_ROOT
  // npm ไม่มี --dir (ใช้ --prefix) — คำสั่งที่พิมพ์ให้ต้องเป็นคำสั่งที่วางแล้วรันได้จริง
  return packageManager() === 'npm'
    ? `npm --prefix ${quoted} run dev`
    : `pnpm --dir ${quoted} dev`
}

let cachedPm
function packageManager() {
  if (cachedPm !== undefined) return cachedPm
  for (const pm of ['pnpm', 'npm']) {
    const probe = spawnSync(pm, ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' })
    if (probe.status === 0) {
      cachedPm = pm
      return pm
    }
  }
  cachedPm = null
  return null
}

/** ถามว่ามี learn-diff viewer รันอยู่ที่พอร์ตนี้ไหม — 'running' | 'free' | 'foreign' */
async function probe() {
  let res
  try {
    res = await fetch(`${url}/api/health`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(2000),
    })
  } catch {
    // ต่อไม่ติด = ไม่มีใครฟังพอร์ตนี้ (หรือมีแต่ไม่ตอบ ซึ่งก็คือรันใหม่ไม่ได้อยู่ดี — เช็คซ้ำตอน start)
    return { state: 'free' }
  }
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok || body?.service !== SERVICE) {
    return { state: 'foreign', status: res.status }
  }
  return { state: 'running', health: body }
}

function report(result) {
  if (asJson) {
    console.log(JSON.stringify(result))
    return
  }
  const lines = []
  if (result.status === 'reused') {
    lines.push(`learn-diff viewer: ใช้ตัวที่รันอยู่แล้ว (pid ${result.pid})`)
  } else if (result.status === 'started') {
    lines.push(`learn-diff viewer: สั่งรันแล้ว (pid ${result.pid})`)
  } else if (result.status === 'stopped') {
    lines.push(`learn-diff viewer: สั่งปิดแล้ว (pid ${result.pid})`)
  } else if (result.status === 'not_running') {
    lines.push('learn-diff viewer: ยังไม่มีตัวไหนรันอยู่')
  } else {
    lines.push(`learn-diff viewer: ${result.message}`)
  }
  if (result.url && result.status !== 'stopped') lines.push(`  เปิดอ่านที่ ${result.url}`)
  if (result.startCommand) lines.push(`  สั่งรันเอง: ${result.startCommand}`)
  if (result.idleShutdownAt) {
    lines.push(`  ปิดตัวเองถ้าไม่มีใครเรียกถึง ${new Date(result.idleShutdownAt).toLocaleString()}`)
  }
  if (result.logFile) lines.push(`  log: ${result.logFile}`)
  console[result.status === 'error' ? 'error' : 'log'](lines.join('\n'))
}

function finish(result, code = 0) {
  report(result)
  process.exit(code)
}

function fail(message, extra = {}) {
  finish({ status: 'error', message, url, startCommand: startCommand(), ...extra }, 1)
}

function lockfileHash() {
  for (const name of ['pnpm-lock.yaml', 'package-lock.json']) {
    const file = path.join(VIEWER_ROOT, name)
    if (!fs.existsSync(file)) continue
    const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    return { name, hash }
  }
  return null
}

/**
 * dependency ครบและตรงกับ lockfile ปัจจุบันไหม — `git pull` ที่เปลี่ยน lockfile ต้องไม่กลายเป็น
 * error ประหลาดตอนรัน (user story 37) · ไม่ครบ/ไม่ตรง = ติดตั้งให้เลย ไม่ใช่แค่เตือน
 */
function ensureDependencies() {
  if (args.flags.has('skip-install')) return
  const lock = lockfileHash()
  const installed = fs.existsSync(path.join(VIEWER_ROOT, 'node_modules'))
  let stamped = null
  try {
    stamped = JSON.parse(fs.readFileSync(DEPS_STAMP, 'utf8'))
  } catch {
    stamped = null
  }
  if (installed && lock && stamped?.hash === lock.hash) return
  if (installed && !lock && stamped) return

  const pm = packageManager()
  if (!pm) {
    fail(
      'ไม่พบทั้ง pnpm และ npm — ติดตั้ง node ≥ 20 แล้ว `corepack enable pnpm` ก่อน\n' +
        '  macOS: brew install node · Windows: winget install OpenJS.NodeJS.LTS',
    )
  }
  console.error(
    installed
      ? 'learn-diff viewer: lockfile เปลี่ยนไปจากตอนติดตั้ง — กำลังติดตั้ง dependency ใหม่…'
      : 'learn-diff viewer: ยังไม่เคยติดตั้ง dependency — กำลังติดตั้ง…',
  )
  const run = spawnSync(pm, ['install'], {
    cwd: VIEWER_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (run.status !== 0) {
    fail(`\`${pm} install\` ล้มเหลวใน ${VIEWER_ROOT} — แก้ให้ผ่านก่อนแล้วค่อยสั่งใหม่`)
  }
  if (lock) {
    fs.mkdirSync(path.dirname(DEPS_STAMP), { recursive: true })
    fs.writeFileSync(
      DEPS_STAMP,
      `${JSON.stringify({ lockfile: lock.name, hash: lock.hash, at: new Date().toISOString() }, null, 2)}\n`,
      'utf8',
    )
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForHealth(deadline, child) {
  while (Date.now() < deadline) {
    const result = await probe()
    if (result.state === 'running') return result.health
    if (child && child.exitCode !== null) return null
    await sleep(300)
  }
  return null
}

async function start() {
  ensureDependencies()
  const pm = packageManager()
  if (!pm) fail('ไม่พบทั้ง pnpm และ npm — ติดตั้ง node ≥ 20 ก่อน')

  const home = homeDir()
  fs.mkdirSync(home, { recursive: true })
  const logFile = path.join(home, 'viewer.log')
  const log = fs.openSync(logFile, 'a')
  fs.writeSync(log, `\n=== ${new Date().toISOString()} ${pm} run dev (LEARN_DIFF_PORT=${port}) ===\n`)

  // พอร์ตส่งผ่าน env ไม่ใช่ argv: `pnpm run dev -- --port N` กลายเป็น `vite -- --port N`
  // ซึ่ง vite เมิน แล้วไปเปิดพอร์ตอื่นเงียบ ๆ — vite.config.ts อ่าน LEARN_DIFF_PORT แทน
  // detached + unref: server ต้องรอดจากการที่ session ของ agent จบ ผู้อ่านถึงจะกลับมาอ่านทีหลังได้
  const child = spawn(pm, ['run', 'dev'], {
    cwd: VIEWER_ROOT,
    detached: process.platform !== 'win32',
    stdio: ['ignore', log, log],
    shell: process.platform === 'win32',
    windowsHide: true,
    env: { ...process.env, LEARN_DIFF_PORT: String(port) },
  })
  child.unref()

  const health = await waitForHealth(Date.now() + waitSeconds * 1000, child)
  fs.closeSync(log)
  if (!health) {
    fail(`สั่งรันแล้วแต่ ${url} ไม่ตอบภายใน ${waitSeconds} วินาที — ดูสาเหตุที่ ${logFile}`, {
      logFile,
    })
  }
  finish({
    status: 'started',
    url,
    pid: health.pid,
    startCommand: startCommand(),
    idleShutdownAt: health.idleShutdownAt ?? null,
    runs: health.runs ?? null,
    logFile,
  })
}

async function main() {
  const found = await probe()

  if (args.flags.has('stop')) {
    if (found.state !== 'running') finish({ status: 'not_running', url }, 0)
    try {
      process.kill(found.health.pid, 'SIGTERM')
    } catch (err) {
      fail(`ปิด pid ${found.health.pid} ไม่ได้: ${err.message}`)
    }
    finish({ status: 'stopped', pid: found.health.pid, url })
  }

  if (found.state === 'foreign') {
    fail(
      `พอร์ต ${port} มีบริการอื่นอยู่ (ตอบ ${found.status ?? '?'} แต่ไม่ใช่ ${SERVICE}) — ` +
        'ปิดตัวนั้นก่อน หรือสั่งใหม่ด้วย --port <พอร์ตอื่น>',
    )
  }

  if (found.state === 'running') {
    finish({
      status: 'reused',
      url,
      pid: found.health.pid,
      startCommand: startCommand(),
      idleShutdownAt: found.health.idleShutdownAt ?? null,
      runs: found.health.runs ?? null,
    })
  }

  if (args.flags.has('probe')) {
    finish({ status: 'not_running', url, startCommand: startCommand() }, 3)
  }

  await start()
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err))
})
