import path from 'node:path'

import { gitShowFile } from '../git'

/**
 * Import resolver ของ TS/JS (CONTRACT-f12 §2.4) — แปลง specifier ดิบเป็น repo-relative path
 *
 * ทุกอย่างอ่านจาก blob ณ pinned commit ไม่ใช่ filesystem: tsconfig.json ที่อยู่บน disk อาจเป็น
 * คนละเวอร์ชันกับ commit ที่กำลังอ่าน และไฟล์ที่ resolve ไปต้องเป็นไฟล์ที่ index รู้จักเท่านั้น
 *
 * ตัว `indexFile` เติม `resolvedPath` เองไม่ได้ (มันต้อง pure ต่อไฟล์เดียวตาม §2.1 จึงไม่รู้จัก
 * รายชื่อไฟล์ทั้ง repo) — ผู้เรียกฝั่ง resolve จึงใช้ resolver ตัวนี้เติมให้ตอน query
 */

/** นามสกุลที่เดาต่อท้าย specifier ที่ไม่ระบุนามสกุล — เรียงตามลำดับที่ TS ใช้จริง */
const GUESS_EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mjs', '.vue']

/** `./x.js` ในโค้ด TS แบบ NodeNext ชี้ไฟล์ต้นทาง `./x.ts` */
const JS_TO_TS: Record<string, readonly string[]> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts', '.ts'],
}

/** ลึกสุดที่ยอมไล่ `extends` ของ tsconfig — กัน chain ยาวผิดปกติ/วนซ้ำ */
const MAX_EXTENDS_DEPTH = 5

export interface TsImportContext {
  repoPath: string
  commit: string
  /** ไฟล์นี้อยู่ใน index ไหม — resolver ชี้ไปได้เฉพาะไฟล์ที่ index รู้จักเท่านั้น */
  hasFile(filePath: string): boolean
}

export interface TsImportResolver {
  /**
   * @param fromPath ไฟล์ที่เขียน import (repo-relative)
   * @param specifier specifier ดิบ เช่น './content', '@/lib/api', 'react'
   * @returns repo-relative path ของไฟล์ปลายทาง — null = external หรือชี้ไม่ได้
   */
  resolve(fromPath: string, specifier: string): Promise<string | null>
}

interface TsconfigPaths {
  /** โฟลเดอร์ (repo-relative, '' = root) ที่ใช้เป็นฐานของ pattern ใน `paths` */
  baseDir: string | null
  paths: Record<string, string[]>
  /** โฟลเดอร์ที่ `baseUrl` ชี้ (repo-relative) — null = ไม่ได้ตั้ง */
  baseUrl: string | null
}

export function createTsImportResolver(ctx: TsImportContext): TsImportResolver {
  /** cache ต่อโฟลเดอร์: tsconfig ที่ "ใกล้สุดขึ้นไปตาม directory" ของโฟลเดอร์นั้น (null = ไม่มีเลย) */
  const nearest = new Map<string, Promise<TsconfigPaths | null>>()
  /** cache ต่อไฟล์ tsconfig ที่อ่านจริง — ใช้ซ้ำตอนไล่ `extends` */
  const configs = new Map<string, Promise<RawTsconfig | null>>()

  const readConfig = (configPath: string): Promise<RawTsconfig | null> => {
    const hit = configs.get(configPath)
    if (hit) return hit
    const reading = loadTsconfig(ctx, configPath)
    configs.set(configPath, reading)
    return reading
  }

  const nearestConfig = (dir: string): Promise<TsconfigPaths | null> => {
    const hit = nearest.get(dir)
    if (hit) return hit
    const finding = findTsconfig(dir, readConfig)
    nearest.set(dir, finding)
    return finding
  }

  const exists = (candidate: string): string | null => {
    if (candidate === '' || candidate.startsWith('..')) return null
    if (ctx.hasFile(candidate)) return candidate

    const ext = path.posix.extname(candidate).toLowerCase()
    for (const swap of JS_TO_TS[ext] ?? []) {
      const swapped = candidate.slice(0, -ext.length) + swap
      if (ctx.hasFile(swapped)) return swapped
    }
    for (const guess of GUESS_EXTENSIONS) {
      if (ctx.hasFile(candidate + guess)) return candidate + guess
    }
    for (const guess of GUESS_EXTENSIONS) {
      const asIndex = `${candidate}/index${guess}`
      if (ctx.hasFile(asIndex)) return asIndex
    }
    return null
  }

  return {
    async resolve(fromPath, specifier) {
      if (specifier === '') return null

      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        return exists(joinRepo(path.posix.dirname(fromPath), specifier))
      }
      // absolute path ในโค้ดชี้ออกนอก repo เสมอ — ไม่มีอะไรให้ resolve
      if (specifier.startsWith('/')) return null

      const config = await nearestConfig(path.posix.dirname(fromPath))
      if (config === null) return null

      for (const candidate of expandPaths(config, specifier)) {
        const found = exists(candidate)
        if (found !== null) return found
      }
      if (config.baseUrl !== null) {
        return exists(joinRepo(config.baseUrl, specifier))
      }
      return null
    },
  }
}

/**
 * ทุก path ที่ `paths` ของ tsconfig แปลง specifier นี้ไปได้ — เรียงตามกฎ TS
 * (pattern ที่ prefix ก่อน `*` ยาวกว่าชนะ, pattern ที่ไม่มี `*` ต้องตรงเป๊ะและมาก่อนเสมอ)
 */
function expandPaths(config: TsconfigPaths, specifier: string): string[] {
  const base = config.baseDir
  if (base === null) return []

  let bestPrefix = -1
  let substitutions: string[] = []
  let captured = ''

  for (const [pattern, targets] of Object.entries(config.paths)) {
    const star = pattern.indexOf('*')
    if (star === -1) {
      if (pattern === specifier && pattern.length > bestPrefix) {
        bestPrefix = pattern.length
        substitutions = targets
        captured = ''
      }
      continue
    }
    const prefix = pattern.slice(0, star)
    const suffix = pattern.slice(star + 1)
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue
    if (specifier.length < prefix.length + suffix.length) continue
    if (prefix.length <= bestPrefix) continue
    bestPrefix = prefix.length
    substitutions = targets
    captured = specifier.slice(prefix.length, specifier.length - suffix.length)
  }

  return substitutions.map((target) => joinRepo(base, target.replace('*', captured)))
}

interface RawTsconfig {
  /** โฟลเดอร์ของไฟล์ config นี้ (repo-relative, '' = root) */
  dir: string
  extends: string | null
  baseUrl: string | null
  paths: Record<string, string[]> | null
}

/** ไล่ขึ้นตาม directory หา tsconfig.json ที่ใกล้ที่สุด แล้วคลี่ `extends` ให้เสร็จ */
async function findTsconfig(
  dir: string,
  readConfig: (configPath: string) => Promise<RawTsconfig | null>,
): Promise<TsconfigPaths | null> {
  let current = dir === '.' ? '' : dir
  for (;;) {
    const configPath = current === '' ? 'tsconfig.json' : `${current}/tsconfig.json`
    const config = await readConfig(configPath)
    if (config !== null) return flatten(config, readConfig)
    if (current === '') return null
    const parent = path.posix.dirname(current)
    current = parent === '.' ? '' : parent
  }
}

/**
 * คลี่ `extends` เป็นค่าเดียว — ลูกชนะพ่อ และ `baseUrl`/`paths` ผูกกับโฟลเดอร์ของ config
 * ที่ประกาศมันจริง ๆ (ไม่ใช่ของลูก) ตามพฤติกรรม TS
 */
async function flatten(
  config: RawTsconfig,
  readConfig: (configPath: string) => Promise<RawTsconfig | null>,
): Promise<TsconfigPaths> {
  let baseUrl: string | null = null
  let paths: Record<string, string[]> | null = null
  let baseDir: string | null = null

  let current: RawTsconfig | null = config
  const seen = new Set<string>()
  for (let depth = 0; current !== null && depth < MAX_EXTENDS_DEPTH; depth += 1) {
    if (baseUrl === null && current.baseUrl !== null) baseUrl = joinRepo(current.dir, current.baseUrl)
    if (paths === null && current.paths !== null) {
      paths = current.paths
      // TS: pattern ใน `paths` อิง baseUrl ถ้ามี ไม่งั้นอิงโฟลเดอร์ของ config ที่ประกาศ paths
      baseDir = current.baseUrl !== null ? joinRepo(current.dir, current.baseUrl) : current.dir
    }
    if (current.extends === null || (baseUrl !== null && paths !== null)) break
    // extends ที่ไม่ใช่ relative path ชี้เข้า node_modules ซึ่งไม่อยู่ใน index — จบแค่นี้
    if (!current.extends.startsWith('.')) break
    const next = joinRepo(current.dir, current.extends)
    const withExt = path.posix.extname(next) === '' ? `${next}.json` : next
    if (seen.has(withExt)) break
    seen.add(withExt)
    current = await readConfig(withExt)
  }

  if (paths !== null && baseDir === null) baseDir = baseUrl ?? config.dir
  return { baseDir, paths: paths ?? {}, baseUrl }
}

async function loadTsconfig(ctx: TsImportContext, configPath: string): Promise<RawTsconfig | null> {
  let text: string
  try {
    text = (await gitShowFile(ctx.repoPath, ctx.commit, configPath)).toString('utf8')
  } catch {
    // ไม่มีไฟล์นี้ที่ commit นี้ (หรือเป็นโฟลเดอร์) — เป็นเคสปกติของการไล่หาขึ้นไป
    return null
  }

  const parsed = parseJsonc(text)
  if (parsed === null) {
    console.warn(`[nav] อ่าน ${configPath} ไม่ออก — ข้าม path alias ของ config นี้`)
    return null
  }

  const options = isRecord(parsed.compilerOptions) ? parsed.compilerOptions : {}
  const rawPaths = isRecord(options.paths) ? options.paths : null
  const paths: Record<string, string[]> = {}
  for (const [pattern, targets] of Object.entries(rawPaths ?? {})) {
    if (Array.isArray(targets)) {
      paths[pattern] = targets.filter((t): t is string => typeof t === 'string')
    }
  }

  const dir = path.posix.dirname(configPath)
  return {
    dir: dir === '.' ? '' : dir,
    extends: typeof parsed.extends === 'string' ? parsed.extends : null,
    baseUrl: typeof options.baseUrl === 'string' ? options.baseUrl : null,
    paths: rawPaths === null ? null : paths,
  }
}

/** ต่อ path แบบ repo-relative (posix เสมอ เพราะ git คืน path แบบนี้) — คืน '' ถ้าหลุดออกนอก root */
function joinRepo(base: string, rel: string): string {
  const joined = path.posix.normalize(path.posix.join(base === '' ? '.' : base, rel))
  if (joined === '.' || joined.startsWith('..')) return ''
  return joined.startsWith('./') ? joined.slice(2) : joined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * tsconfig.json เป็น JSONC — มี comment และ trailing comma ได้ ซึ่ง `JSON.parse` ไม่รับ
 * จึงลอกทั้งสองอย่างออกก่อน (ข้ามส่วนที่อยู่ใน string เพื่อไม่ไปทำลาย path ที่มี `//`)
 */
function parseJsonc(text: string): Record<string, unknown> | null {
  let out = ''
  let inString = false
  let inLine = false
  let inBlock = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!
    const next = text[i + 1]
    if (inLine) {
      if (ch === '\n') {
        inLine = false
        out += ch
      }
      continue
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false
        i += 1
      } else if (ch === '\n') {
        out += ch
      }
      continue
    }
    if (inString) {
      out += ch
      if (ch === '\\') {
        out += next ?? ''
        i += 1
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      continue
    }
    if (ch === '/' && next === '/') {
      inLine = true
      i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      inBlock = true
      i += 1
      continue
    }
    out += ch
  }

  const withoutTrailingCommas = out.replace(/,(\s*[}\]])/g, '$1')
  try {
    const parsed: unknown = JSON.parse(withoutTrailingCommas)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}
