#!/usr/bin/env node
/**
 * ลงทะเบียน run หนึ่งอันเข้า registry ของ viewer
 *
 *   node scripts/register-run.mjs \
 *     --repo /path/to/repo --content /path/to/repo/.learn-diff/pr-230-foo \
 *     --commit <sha> --pr 230 --title "แจ้งลิงก์ ETax Link" \
 *     [--base <sha ของ merge-base>] [--id pr-230-foo] [--url https://github.com/org/repo/pull/230]
 *
 * registry อยู่ที่ $LEARN_DIFF_HOME/runs.json (default ~/.claude/learn-diff/runs.json)
 * skill เป็นคนเรียกสคริปต์นี้หลังเขียน content เสร็จ — ตัว server อ่านอย่างเดียว ไม่เขียน
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      args[key] = 'true'
    } else {
      args[key] = next
      i += 1
    }
  }
  return args
}

function die(message) {
  console.error(`register-run: ${message}`)
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
const repoPath = args.repo ? path.resolve(args.repo) : null
const contentDir = args.content ? path.resolve(args.content) : null

if (!repoPath) die('ต้องระบุ --repo <path ของ repo>')
if (!contentDir) die('ต้องระบุ --content <path ของโฟลเดอร์ที่มี run.json>')
if (!fs.existsSync(path.join(contentDir, 'run.json'))) {
  die(`ไม่พบ run.json ใน ${contentDir}`)
}

const id = args.id ?? path.basename(contentDir)
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) die(`run id "${id}" ใช้อักขระที่ไม่อนุญาต`)

const runJson = JSON.parse(fs.readFileSync(path.join(contentDir, 'run.json'), 'utf8'))
const entry = {
  id,
  repoPath,
  // เก็บเป็น relative เมื่อ content อยู่ใน repo — registry ย้ายเครื่องแล้วแก้ทีเดียวจบ
  contentDir: contentDir.startsWith(repoPath + path.sep)
    ? path.relative(repoPath, contentDir)
    : contentDir,
  commit: args.commit ?? runJson.commit ?? '',
  // base ของ PR — ไม่มีก็ยังอ่าน run ได้ แค่ diff view จะบอกว่า "เทียบไม่ได้"
  baseCommit: args.base ?? runJson.baseCommit ?? undefined,
  pr: {
    number: Number(args.pr ?? runJson.pr?.number ?? 0),
    title: args.title ?? runJson.pr?.title ?? runJson.title ?? id,
    url: args.url ?? runJson.pr?.url,
  },
  title: args.title ?? runJson.title ?? id,
  createdAt: args.date ?? new Date().toISOString(),
}

const home = process.env.LEARN_DIFF_HOME
  ? path.resolve(process.env.LEARN_DIFF_HOME)
  : path.join(os.homedir(), '.claude', 'learn-diff')
const registryFile = path.join(home, 'runs.json')

fs.mkdirSync(home, { recursive: true })
let registry = { schemaVersion: 1, runs: [] }
if (fs.existsSync(registryFile)) {
  try {
    registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'))
  } catch {
    die(`${registryFile} อ่านไม่ออก (JSON เสีย) — แก้หรือลบไฟล์นี้ก่อน`)
  }
  if (!Array.isArray(registry.runs)) registry.runs = []
}
registry.schemaVersion = 1
registry.runs = registry.runs.filter((run) => run.id !== id)
registry.runs.push(entry)

const tmp = `${registryFile}.tmp`
fs.writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
fs.renameSync(tmp, registryFile)

console.log(`ลงทะเบียนแล้ว: ${id} → ${registryFile}`)
console.log(`เปิดอ่านที่ http://127.0.0.1:5174/r/${id}`)
