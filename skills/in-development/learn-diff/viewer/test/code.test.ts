import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { splitLines } from '../server/file'
import { languageForPath } from '../src/shared/languages'

/**
 * สองเรื่องที่เทสต์ระดับ node ตรวจได้จริงเกี่ยวกับการแสดงโค้ด:
 *   1. การตัดบรรทัด/เดาภาษา — logic ล้วน ๆ ที่ file API พึ่งพา
 *   2. ขอบเขตของ engine — CodeMirror ต้องอยู่ในโฟลเดอร์เดียว จะได้เปลี่ยนตัวได้ทีหลัง
 * ส่วนการวาดจริงของ CodeMirror ไม่ทดสอบอัตโนมัติ (SPEC-v3 → Testing Decisions)
 */

const SRC = fileURLToPath(new URL('../src', import.meta.url))

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|tsx)$/.test(full) ? [full] : []
  })
}

describe('ตัดบรรทัดแบบรักษาไบต์เดิม', () => {
  it('newline ปิดท้ายไฟล์ไม่นับเป็นบรรทัดใหม่', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b'])
    expect(splitLines('a\nb')).toEqual(['a', 'b'])
  })

  it('บรรทัดว่างตรงกลางยังนับ', () => {
    expect(splitLines('a\n\nb\n')).toEqual(['a', '', 'b'])
  })

  it('ไฟล์ว่าง = ศูนย์บรรทัด', () => {
    expect(splitLines('')).toEqual([])
  })

  it('บรรทัดว่างท้ายไฟล์สองอันเหลือหนึ่ง (อันหลังคือ newline ปิดท้าย)', () => {
    expect(splitLines('a\n\n')).toEqual(['a', ''])
  })

  it('`\\r` ของ CRLF ถูกเก็บไว้ (CodeMirror ยุบเป็นบรรทัดเดียวให้เองตอนแสดง)', () => {
    expect(splitLines('a\r\nb\r\n')).toEqual(['a\r', 'b\r'])
  })
})

describe('เดาภาษาจากนามสกุล', () => {
  it('ภาษาที่ทีมใช้จริง', () => {
    expect(languageForPath('apps/api/src/main.py')).toBe('python')
    expect(languageForPath('src/App.vue')).toBe('vue')
    expect(languageForPath('src/lib/api.ts')).toBe('typescript')
    expect(languageForPath('src/App.tsx')).toBe('tsx')
    expect(languageForPath('migrations/001.sql')).toBe('sql')
    expect(languageForPath('docker-compose.yml')).toBe('yaml')
  })

  it('ไม่รู้จัก = null (แสดงเป็น plain text ไม่ใช่ error)', () => {
    expect(languageForPath('Dockerfile')).toBeNull()
    expect(languageForPath('bin/run')).toBeNull()
    expect(languageForPath('.env')).toBeNull()
  })
})

describe('ขอบเขตของตัวแสดงโค้ด', () => {
  const files = walk(SRC)

  it('มีแต่ไฟล์ใน lib/code ที่ import CodeMirror', () => {
    const importers = files.filter((file) => /['"](@codemirror|@lezer)\//.test(readFileSync(file, 'utf8')))
    const outside = importers.filter((file) => !file.startsWith(join(SRC, 'lib', 'code')))
    expect(outside).toEqual([])
    expect(importers.length).toBeGreaterThan(0)
  })

  it('โค้ดนอกโฟลเดอร์ code เรียกผ่าน @/lib/code เท่านั้น', () => {
    const outside = files.filter((file) => !file.startsWith(join(SRC, 'lib', 'code')))
    const leaks = outside.filter((file) => /@\/lib\/code\/[a-z]/.test(readFileSync(file, 'utf8')))
    expect(leaks).toEqual([])
  })
})
