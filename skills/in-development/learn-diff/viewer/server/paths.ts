import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * ที่เก็บ state ของ skill ฝั่ง user (registry, concept ledger)
 * override ได้ด้วย LEARN_DIFF_HOME — เทสต์ใช้ temp dir ผ่านตัวแปรนี้
 */
export function learnDiffHome(): string {
  const override = process.env.LEARN_DIFF_HOME
  if (override && override.trim() !== '') return path.resolve(override)
  return path.join(os.homedir(), '.claude', 'learn-diff')
}

export function registryPath(): string {
  return path.join(learnDiffHome(), 'runs.json')
}

let cachedViewerRoot: string | null = null

/**
 * โฟลเดอร์ viewer — ใช้ประกอบคำสั่ง "สั่งรันเอง" ที่พิมพ์ให้ผู้อ่าน (user story 40)
 *
 * หาโดยไต่ขึ้นไปหา package.json ของ viewer แทนการนับ `..` จากไฟล์นี้ เพราะตอนรันจริง
 * vite เอา config + ไฟล์ที่ config import แบบ relative มา bundle รวมเป็นไฟล์ชั่วคราว
 * ที่ root ของ viewer — ระยะห่างจากไฟล์นี้ถึง root จึงไม่คงที่
 */
export function viewerRoot(): string {
  if (cachedViewerRoot !== null) return cachedViewerRoot
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i += 1) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
        name?: string
      }
      if (pkg.name === 'learn-diff-viewer') {
        cachedViewerRoot = dir
        return dir
      }
    } catch {
      // ไม่มี package.json ตรงนี้ก็ไต่ขึ้นต่อ
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  cachedViewerRoot = process.cwd()
  return cachedViewerRoot
}

/**
 * `child` อยู่ใน `parent` จริงไหม — ใช้ path.relative แทนการเทียบ string prefix
 * (prefix compare พังทั้งเรื่อง `..` และเรื่อง separator ของ Windows)
 */
export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  if (rel === '') return true
  return !rel.startsWith('..') && !path.isAbsolute(rel)
}

/** resolve path ที่มาจาก request แล้วยืนยันว่าไม่หลุดออกนอก root — หลุด = null */
export function safeResolve(root: string, ...segments: string[]): string | null {
  const target = path.resolve(root, ...segments)
  return isInside(root, target) ? target : null
}
