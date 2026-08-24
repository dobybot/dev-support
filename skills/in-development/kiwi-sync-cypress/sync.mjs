import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ENV_PATH = resolve(__dirname, '../../scripts/kiwi/.env')

// ─── อ่าน .env ────────────────────────────────────────────────────────────────

function printUsage() {
  console.log(`Usage: node sync.mjs <cypress-results.json> [--apply] [--env <path>]

Sync Cypress JSON reporter results to Kiwi TCMS automation_status.

Default env file:
  ${DEFAULT_ENV_PATH}

Required env variables:
  KIWI_BASE_URL, KIWI_USERNAME, KIWI_PASSWORD

Without --apply this command performs a dry-run.`)
}

function parseArgs(argv) {
  const args = { apply: false, envPath: DEFAULT_ENV_PATH, resultsPath: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }
    if (arg === '--apply') {
      args.apply = true
      continue
    }
    if (arg === '--env') {
      const envPath = argv[++i]
      if (!envPath) {
        console.error('ERROR: --env requires a file path')
        process.exit(2)
      }
      args.envPath = resolve(envPath)
      continue
    }
    if (arg.startsWith('--')) {
      console.error(`ERROR: unknown option ${arg}`)
      process.exit(2)
    }
    if (args.resultsPath) {
      console.error(`ERROR: unexpected extra argument ${arg}`)
      process.exit(2)
    }
    args.resultsPath = arg
  }
  return args
}

function cleanEnvValue(value) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function loadEnv(envPath) {
  if (!existsSync(envPath)) {
    console.error(`ERROR: ไม่พบไฟล์ env: ${envPath}`)
    process.exit(1)
  }
  const env = {}
  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eqIdx = line.indexOf('=')
    if (eqIdx === -1) continue
    const key = line.slice(0, eqIdx).trim()
    const val = cleanEnvValue(line.slice(eqIdx + 1))
    if (key) env[key] = val
  }
  return env
}

// ─── Extract TC ID จาก test title ────────────────────────────────────────────

function extractTCId(title) {
  const m = (title ?? '').match(/\b(TC-\d+(?:-\d+)?)\b/)
  return m ? m[1] : null
}

function isSubTC(tcId) {
  return /^TC-\d+-\d+$/.test(tcId)
}

// ─── Kiwi TCMS JSON-RPC client ────────────────────────────────────────────────
// Kiwi ไม่มี REST API (`/api/v6/`) — ใช้ JSON-RPC ที่ `/json-rpc/` และ auth ด้วย
// `Auth.login` → เก็บ sessionid cookie (Basic Auth ใช้ไม่ได้)

class KiwiClient {
  constructor(baseUrl) {
    this.rpcUrl = baseUrl.replace(/\/$/, '') + '/json-rpc/'
    this.cookie = null
    this._id = 0
  }

  async call(method, params) {
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: ++this._id }),
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) {
      const sid = setCookie.match(/sessionid=[^;]+/)
      if (sid) this.cookie = sid[0]
    }
    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`RPC ${method} → non-JSON (HTTP ${res.status}): ${text.slice(0, 120)}`)
    }
    if (data.error) throw new Error(`RPC ${method} → ${data.error.message}`)
    return data.result
  }

  async login(username, password) {
    await this.call('Auth.login', [username, password])
  }

  // คืน Map<id, automation_status> ของ id ที่มีจริงใน Kiwi
  async statusByIds(ids) {
    if (!ids.length) return new Map()
    const rows = await this.call('TestCase.filter', [{ id__in: ids }])
    return new Map(rows.map(r => [r.id, r.automation_status]))
  }

  async updateStatus(id, status) {
    try {
      await this.call('TestCase.update', [id, { automation_status: status }])
      return { ok: true }
    } catch (e) {
      return { ok: false, detail: e.message }
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2))
if (!args.resultsPath) {
  printUsage()
  process.exit(1)
}

const env = loadEnv(args.envPath)

if (!env.KIWI_BASE_URL || !env.KIWI_USERNAME || !env.KIWI_PASSWORD) {
  console.error(`ERROR: กรุณาตั้งค่า KIWI_BASE_URL, KIWI_USERNAME, KIWI_PASSWORD ใน ${args.envPath}`)
  process.exit(1)
}
if (env.KIWI_PASSWORD === 'your_password') {
  console.error(`ERROR: KIWI_PASSWORD ยังเป็น placeholder — แก้ใน ${args.envPath} ก่อน`)
  process.exit(1)
}

// ─── Parse Cypress JSON output ────────────────────────────────────────────────
// `cypress run --reporter json` พ่น JSON หนึ่งก้อน "ต่อ spec หนึ่งไฟล์" ปนกับ
// แบนเนอร์/ตารางสรุปของ Cypress เอง — ไฟล์ผลลัพธ์จึงมีหลายก้อน JSON คั่นด้วย
// ข้อความที่ไม่ใช่ JSON การ JSON.parse ทั้งไฟล์ครั้งเดียวจึงพังเสมอ
// วิธีแก้: หาแต่ละก้อนที่ขึ้นต้นด้วย `{ "stats"` แล้ว brace-match แบบรู้จัก string
// จากนั้น merge passes/failures/pending/tests ของทุก spec เข้าด้วยกัน

const raw = readFileSync(args.resultsPath, 'utf8')

// สแกนหา `{` ที่ตามด้วย whitespace แล้ว `"stats"` = จุดเริ่มของก้อน JSON จริง
function extractObjects(text) {
  const objs = []
  const anchor = /\{\s*"stats"\s*:/g
  let m
  while ((m = anchor.exec(text)) !== null) {
    const startIdx = m.index
    let depth = 0
    let inStr = false
    let esc = false
    let endIdx = -1
    for (let i = startIdx; i < text.length; i++) {
      const ch = text[i]
      if (inStr) {
        if (esc) esc = false
        else if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') inStr = true
      else if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) { endIdx = i; break }
      }
    }
    if (endIdx === -1) continue
    try {
      objs.push(JSON.parse(text.slice(startIdx, endIdx + 1)))
    } catch {
      // ก้อนพัง → ข้าม
    }
    anchor.lastIndex = endIdx + 1
  }
  return objs
}

const blobs = extractObjects(raw)
if (blobs.length === 0) {
  console.error('ERROR: ไม่พบก้อน JSON (`{ "stats" ... }`) ใน', args.resultsPath)
  console.error('ตรวจสอบว่า cypress run --reporter json ทำงานถูกต้อง')
  process.exit(1)
}

// merge ทุก spec เข้าเป็นผลรวมเดียว
const results = { passes: [], failures: [], pending: [], skipped: [] }
for (const b of blobs) {
  for (const k of ['passes', 'failures', 'pending', 'skipped']) {
    if (Array.isArray(b[k])) results[k].push(...b[k])
  }
}
console.log(`รวม ${blobs.length} spec — passes:${results.passes.length} failures:${results.failures.length} pending:${results.pending.length}`)

// ─── สร้าง status map ─────────────────────────────────────────────────────────
// Kiwi instance นี้ใช้ค่า automation_status เป็น lowercase — ค่า valid คือ
// todo/in_progress/in_review/done/maintenance/not_automatable
//   pass                     → done
//   fail/error/pending/skip  → maintenance  (automation มีอยู่แต่ตอนนี้ไม่ผ่าน/ต้องซ่อม)
// maintenance ชนะ done เสมอ (ถ้า sub-test หนึ่งตัว fail → TC นั้น maintenance)

const STATUS_PASS = 'done'
const STATUS_FAIL = 'maintenance'
// สถานะที่ curate ด้วยมือ — ห้ามทับ
const PROTECTED = new Set(['not_automatable', 'in_review'])

const statusMap = new Map()

function mark(tests, status) {
  for (const t of tests ?? []) {
    const tc = extractTCId(t.fullTitle ?? t.title)
    if (!tc) continue
    if (status === STATUS_FAIL || !statusMap.has(tc)) {
      statusMap.set(tc, status)
    }
  }
}

mark(results.passes, STATUS_PASS)
mark(results.failures, STATUS_FAIL)
mark(results.pending, STATUS_FAIL)
mark(results.skipped, STATUS_FAIL)

if (statusMap.size === 0) {
  console.log('ไม่พบ TC-XXX ใน test results — ตรวจสอบ test file naming convention')
  process.exit(0)
}

console.log(`\nพบ ${statusMap.size} TC จาก Cypress results`)

// ─── วางแผน + อัพเดท Kiwi ─────────────────────────────────────────────────────
// รันโดยไม่ใส่ --apply = dry-run (แสดงแผนอย่างเดียว ไม่เขียน)
// ใส่ --apply = เขียนจริง

const APPLY = args.apply

const kiwi = new KiwiClient(env.KIWI_BASE_URL)
await kiwi.login(env.KIWI_USERNAME, env.KIWI_PASSWORD)

// TC-131 → Kiwi id 131 (parent เท่านั้น). sub-TC (TC-143-2) ไม่มี field ให้ map
// ใน Kiwi instance นี้ (summary เป็นภาษาไทย ไม่มีรหัส TC) → resolve ไม่ได้
const parents = []      // { tcId, kiwiId, target }
const unresolved = []   // sub-TC ที่ map ไม่ได้
for (const [tcId, status] of statusMap) {
  if (isSubTC(tcId)) { unresolved.push(tcId); continue }
  parents.push({ tcId, kiwiId: Number(tcId.replace('TC-', '')), target: status })
}

// ดึงสถานะปัจจุบันของทุก id ทีเดียว
const current = await kiwi.statusByIds(parents.map(p => p.kiwiId))

const toUpdate = []   // { tcId, kiwiId, from, to }
const protectedSkip = []
const unchanged = []
const notFound = []
for (const p of parents) {
  if (!current.has(p.kiwiId)) { notFound.push(p.tcId); continue }
  const from = current.get(p.kiwiId)
  if (PROTECTED.has(from)) { protectedSkip.push({ ...p, from }); continue }
  if (from === p.target) { unchanged.push({ ...p, from }); continue }
  toUpdate.push({ tcId: p.tcId, kiwiId: p.kiwiId, from, to: p.target })
}

// ─── แสดงแผน ─────────────────────────────────────────────────────────────────
console.log(`\n${APPLY ? '🖊  APPLY' : '🔎 DRY-RUN (ยังไม่เขียน — ใส่ --apply เพื่อเขียนจริง)'}`)
console.log('\nจะเปลี่ยนสถานะ (from → to):')
if (!toUpdate.length) console.log('     (ไม่มี)')
for (const r of toUpdate) console.log(`     ${r.tcId.padEnd(10)} #${String(r.kiwiId).padEnd(5)} ${r.from ?? 'null'} → ${r.to}`)

console.log(`\nปกป้องไว้ (curated — ข้าม): ${protectedSkip.length}`)
for (const r of protectedSkip) console.log(`     ${r.tcId.padEnd(10)} #${String(r.kiwiId).padEnd(5)} คง ${r.from}`)

console.log(`\nเหมือนเดิม (ไม่ต้องเขียน): ${unchanged.length}`)
for (const r of unchanged) console.log(`     ${r.tcId.padEnd(10)} #${String(r.kiwiId).padEnd(5)} คง ${r.from}`)

if (notFound.length) {
  console.log(`\nไม่พบใน Kiwi (ข้าม): ${notFound.length}`)
  console.log(`     ${notFound.join(', ')}`)
}
if (unresolved.length) {
  console.log(`\nsub-TC map ไม่ได้ (ไม่มี field ใน Kiwi): ${unresolved.length}`)
  console.log(`     ${unresolved.join(', ')}`)
}

// ─── เขียนจริง ───────────────────────────────────────────────────────────────
const errors = []
let written = 0
if (APPLY && toUpdate.length) {
  console.log('\nกำลังเขียน...')
  for (const r of toUpdate) {
    const res = await kiwi.updateStatus(r.kiwiId, r.to)
    if (res.ok) { written++; console.log(`     ✓ ${r.tcId} #${r.kiwiId} → ${r.to}`) }
    else errors.push({ ...r, detail: res.detail })
  }
}
if (errors.length) {
  console.log(`\n✗ Error: ${errors.length}`)
  for (const r of errors) console.log(`     ${r.tcId} #${r.kiwiId} — ${r.detail}`)
}

console.log(
  APPLY
    ? `\nเขียนสำเร็จ ${written}/${toUpdate.length} | ปกป้อง ${protectedSkip.length} | เหมือนเดิม ${unchanged.length} | ไม่พบ ${notFound.length}\n`
    : `\nแผน: จะเขียน ${toUpdate.length} | ปกป้อง ${protectedSkip.length} | เหมือนเดิม ${unchanged.length} | ไม่พบ ${notFound.length}\n`,
)
