import { describe, expect, it } from 'vitest'

import { stripDuplicateH1 } from '../src/lib/strip-duplicate-h1'

/** viewer กลืน h1 แรกที่ซ้ำกับ sections[].title (issue #19) — หัวข้อแสดงจาก run.json อยู่แล้ว */
describe('stripDuplicateH1', () => {
  it('ตัด h1 แรกที่ตรงกับ title ทิ้ง', () => {
    expect(stripDuplicateH1('# ภาพรวมระบบ\n\nเนื้อหา', 'ภาพรวมระบบ')).toBe('\nเนื้อหา')
  })

  it('ข้ามบรรทัดว่างนำหน้าได้', () => {
    expect(stripDuplicateH1('\n\n# ภาพรวมระบบ\nเนื้อหา', 'ภาพรวมระบบ')).toBe('เนื้อหา')
  })

  it('เทียบแบบ normalize ช่องว่าง', () => {
    expect(stripDuplicateH1('#  ภาพรวม   ระบบ \nเนื้อหา', 'ภาพรวม ระบบ')).toBe('เนื้อหา')
  })

  it('h1 ที่ข้อความไม่ตรง title ไม่ถูกแตะ', () => {
    const md = '# หัวข้ออื่น\nเนื้อหา'
    expect(stripDuplicateH1(md, 'ภาพรวมระบบ')).toBe(md)
  })

  it('เนื้อหาที่ไม่ได้เริ่มด้วย h1 ไม่ถูกแตะ', () => {
    const md = 'ย่อหน้าแรก\n# ภาพรวมระบบ'
    expect(stripDuplicateH1(md, 'ภาพรวมระบบ')).toBe(md)
  })

  it('h2 ไม่นับเป็น h1', () => {
    const md = '## ภาพรวมระบบ\nเนื้อหา'
    expect(stripDuplicateH1(md, 'ภาพรวมระบบ')).toBe(md)
  })
})
