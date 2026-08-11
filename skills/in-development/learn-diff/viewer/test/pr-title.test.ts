import { describe, expect, it } from 'vitest'

import { APP_TITLE, runDocumentTitle, runHeading, stripPrPrefix } from '../src/lib/pr-title'

/**
 * viewer ประกอบ "PR #N — " เองเสมอ จึงต้องกัน prefix ที่ agent ใส่มาใน run.title ซ้ำ (issue #42)
 * เทสต์เฉพาะกฎล้วน — heading/topbar/tab title จริงตรวจด้วยมือตาม convention เดิม
 */
describe('stripPrPrefix', () => {
  it('ตัด prefix ที่เลขตรงกับ pr.number', () => {
    expect(stripPrPrefix('PR #280 — รหัสสมาชิกจาก POS', 280)).toBe('รหัสสมาชิกจาก POS')
  })

  it('เลขไม่ตรงคือข้อมูลของ PR อื่น — ไม่แตะ', () => {
    const title = 'PR #281 — รหัสสมาชิกจาก POS'
    expect(stripPrPrefix(title, 280)).toBe(title)
  })

  it('รับ separator ได้หลายแบบ', () => {
    expect(stripPrPrefix('PR #280 — ก', 280)).toBe('ก')
    expect(stripPrPrefix('PR #280 – ก', 280)).toBe('ก')
    expect(stripPrPrefix('PR #280 - ก', 280)).toBe('ก')
    expect(stripPrPrefix('PR #280: ก', 280)).toBe('ก')
    expect(stripPrPrefix('PR#280—ก', 280)).toBe('ก')
    expect(stripPrPrefix('pr #280 — ก', 280)).toBe('ก')
  })

  it('title ที่ไม่มี prefix ไม่ถูกแตะ', () => {
    expect(stripPrPrefix('รหัสสมาชิกจาก POS', 280)).toBe('รหัสสมาชิกจาก POS')
  })

  it('เลขตรงแต่ไม่มี separator ไม่นับเป็น prefix', () => {
    expect(stripPrPrefix('PR #280 รหัสสมาชิก', 280)).toBe('PR #280 รหัสสมาชิก')
  })

  it('prefix ซ้อนหลายชั้นตัดจนหมด', () => {
    expect(stripPrPrefix('PR #280 — PR #280 — รหัสสมาชิก', 280)).toBe('รหัสสมาชิก')
  })

  it('prefix ซ้อนที่ชั้นในเลขไม่ตรง หยุดตัดที่ชั้นนั้น', () => {
    expect(stripPrPrefix('PR #280 — PR #99 — รหัสสมาชิก', 280)).toBe('PR #99 — รหัสสมาชิก')
  })

  it('title ที่มีแต่ prefix ล้วน ไม่ถูกตัดจนว่าง', () => {
    expect(stripPrPrefix('PR #280 — ', 280)).toBe('PR #280 — ')
  })
})

describe('ชื่อที่ viewer แสดง', () => {
  it('heading ประกอบ prefix ครั้งเดียวไม่ว่า title จะมีมาหรือไม่', () => {
    expect(runHeading(280, 'รหัสสมาชิกจาก POS')).toBe('PR #280 — รหัสสมาชิกจาก POS')
    expect(runHeading(280, 'PR #280 — รหัสสมาชิกจาก POS')).toBe('PR #280 — รหัสสมาชิกจาก POS')
  })

  it('ชื่อแท็บต่อท้ายด้วยชื่อ app', () => {
    expect(runDocumentTitle(280, 'PR #280: รหัสสมาชิกจาก POS')).toBe(
      `PR #280 — รหัสสมาชิกจาก POS · ${APP_TITLE}`,
    )
  })
})
