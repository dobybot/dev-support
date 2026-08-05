import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { normalizeDiagramSource } from '../src/lib/diagram/normalize'
import { BUILTIN_CLASSES, parseDiagram } from '../src/lib/diagram/subset'

/**
 * เทสต์ของไดอะแกรม แบ่งเป็นสองอย่างที่ automate ได้จริง:
 *   1. subset — กฎว่า agent เขียนอะไรได้/ไม่ได้ (ตัว parser เป็น pure function)
 *   2. ขอบเขตของ engine — ยืนยันว่ามีไฟล์เดียวในแอปที่ import mermaid
 *
 * "mermaid layout" ไม่อยู่ในเทสต์อัตโนมัติโดยตั้งใจ (SPEC-v3 → Testing Decisions)
 * ผลลัพธ์ที่ตาเห็นตรวจด้วย acceptance test บนหน้าเว็บจริง
 */

const SRC = fileURLToPath(new URL('../src', import.meta.url))

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })
}

const VALID = `flowchart LR
  %% ทางเดินของ order ที่ validate ไม่ผ่าน
  LZ[Lazada] --> DS[dobysync]
  DS -- webhook --> VAL{ETaxService.validate}
  VAL -->|ไม่ผ่าน| ERRS[auto_etax_errors]
  VAL -. ผ่าน .-> AUTOQ([queue auto-etax])
  ERRS -.- NOTE(ไอคอนแดงในหน้า order center)

  subgraph NEW [เส้นทางใหม่ที่ PR นี้ต่อ]
    direction TB
    ENQ[maybe_enqueue]
    HANDLER[handler]
  end

  ERRS --> ENQ
  ENQ --> HANDLER

  class ENQ,HANDLER changed
  class NEW changed
  class LZ external
`

describe('subset ของ mermaid', () => {
  it('ผ่านทุกรูปแบบที่อนุญาต และเก็บ node/subgraph ได้ครบ', () => {
    const parsed = parseDiagram(VALID)
    expect(parsed.violations).toEqual([])
    expect(parsed.direction).toBe('LR')
    expect(parsed.subgraphs).toEqual(['NEW'])
    expect(parsed.nodes).toEqual([
      'LZ',
      'DS',
      'VAL',
      'ERRS',
      'AUTOQ',
      'NOTE',
      'ENQ',
      'HANDLER',
    ])
    expect(parsed.classUsages).toEqual(['changed', 'changed', 'external'])
  })

  it('ป้ายชื่อที่มีขีดหรือลูกศรอยู่ข้างในไม่ถูกอ่านเป็นเส้นเชื่อม', () => {
    const parsed = parseDiagram('flowchart LR\n  A[ค่า -1 -> 0] --> B[x --> y]')
    expect(parsed.violations).toEqual([])
    expect(parsed.nodes).toEqual(['A', 'B'])
  })

  const rejected: [string, string, RegExp][] = [
    ['click', 'flowchart LR\n  A[x]\n  click A "http://x"', /click/],
    ['style รายตัว', 'flowchart LR\n  A[x]\n  style A fill:#f00', /style/],
    ['linkStyle', 'flowchart LR\n  A[x] --> B[y]\n  linkStyle 0 stroke:#f00', /linkStyle/],
    ['init directive', 'flowchart LR\n  %%{init: {"theme":"dark"}}%%\n  A[x]', /init directive/],
    ['เส้นหนา', 'flowchart LR\n  A[x] ==> B[y]', /เส้นหนา/],
    ['ลูกศรย้อน', 'flowchart LR\n  A[x] <--> B[y]', /ย้อน/],
    ['รูปทรงนอก subset', 'flowchart LR\n  A{{x}} --> B[y]', /hexagon/],
    ['class ติด node', 'flowchart LR\n  A[x]:::changed --> B[y]', /class A changed/],
    ['ไดอะแกรมชนิดอื่น', 'sequenceDiagram\n  A->>B: hi', /flowchart/],
    ['บรรทัดแรกไม่ใช่ flowchart', 'A[x] --> B[y]', /บรรทัดแรก/],
    ['ทิศทางที่ไม่มีจริง', 'flowchart XY\n  A[x]', /ทิศทาง/],
    ['subgraph ไม่ปิด', 'flowchart LR\n  subgraph S [ชื่อ]\n  A[x]', /end/],
    ['class ที่ไม่มีจริง', 'flowchart LR\n  A[x]\n  class A highlight', /ไม่มีอยู่จริง/],
    ['class ชี้ node ที่ไม่มี', 'flowchart LR\n  A[x]\n  class B changed', /ไม่มีใน diagram/],
    ['เชื่อมด้วย &', 'flowchart LR\n  A[x] --> B[y]\n  A & B --> C[z]', /&/],
  ]

  it.each(rejected)('ปฏิเสธ: %s', (_name, source, message) => {
    const parsed = parseDiagram(source)
    expect(parsed.violations.length).toBeGreaterThan(0)
    expect(parsed.violations.map((v) => v.message).join('\n')).toMatch(message)
  })

  it('`graph` แทน `flowchart` เตือนแต่ยังอ่าน node ต่อได้', () => {
    const parsed = parseDiagram('graph LR\n  A[x] --> B[y]')
    expect(parsed.violations).toHaveLength(1)
    expect(parsed.nodes).toEqual(['A', 'B'])
  })

  it('classDef ที่ประกาศเองนับเป็น class ที่มีจริง', () => {
    const parsed = parseDiagram('flowchart LR\n  A[x]\n  classDef mine fill:#fff\n  class A mine')
    expect(parsed.violations).toEqual([])
    expect(parsed.classDefs).toEqual(['mine'])
  })
})

describe('normalizeDiagramSource', () => {
  it('แทรก classDef ของ class มาตรฐานให้ครบ ใต้บรรทัด flowchart', () => {
    const out = normalizeDiagramSource('flowchart LR\n  A[x]\n  class A changed', { dark: false })
    const lines = out.split('\n')
    expect(lines[0]).toBe('flowchart LR')
    for (const name of BUILTIN_CLASSES) {
      expect(out).toContain(`classDef ${name} `)
    }
    expect(lines.slice(1, 1 + BUILTIN_CLASSES.length).every((l) => l.includes('classDef'))).toBe(true)
    // ของเดิมยังอยู่ครบ
    expect(out).toContain('  A[x]')
    expect(out).toContain('  class A changed')
  })

  it('ไม่ทับ classDef ที่ source ประกาศเอง', () => {
    const out = normalizeDiagramSource(
      'flowchart LR\n  classDef changed fill:#fde68a\n  A[x]',
      { dark: false },
    )
    expect(out.match(/classDef changed/g)).toHaveLength(1)
    expect(out).toContain('classDef changed fill:#fde68a')
  })

  it('สีเปลี่ยนตามโหมดมืด', () => {
    const light = normalizeDiagramSource('flowchart LR\n  A[x]', { dark: false })
    const dark = normalizeDiagramSource('flowchart LR\n  A[x]', { dark: true })
    expect(light).not.toBe(dark)
  })

  it('source ที่ไม่มี header ถูกส่งต่อไปให้ engine บ่นเอง', () => {
    expect(normalizeDiagramSource('%% ว่างเปล่า', { dark: false })).toBe('%% ว่างเปล่า')
  })
})

describe('ขอบเขตของ engine', () => {
  const files = walk(SRC)

  it('มีไฟล์เดียวที่ import mermaid', () => {
    const importers = files.filter((file) => /from 'mermaid'|import\('mermaid'\)/.test(readFileSync(file, 'utf8')))
    expect(importers.map((f) => f.slice(SRC.length + 1))).toEqual(['lib/diagram/engine-mermaid.ts'])
  })

  it('โค้ดนอกโฟลเดอร์ diagram เรียกผ่าน @/lib/diagram เท่านั้น', () => {
    const outside = files.filter((file) => !file.startsWith(join(SRC, 'lib', 'diagram')))
    const leaks = outside.filter((file) =>
      /@\/lib\/diagram\/[a-z]/.test(readFileSync(file, 'utf8')),
    )
    expect(leaks).toEqual([])
  })

  /**
   * การกด node ต้องไม่พึ่งคำสั่ง `click` ของ mermaid ซึ่งบังคับให้เปิด securityLevel: loose
   * (= ยอมให้ HTML/script ในป้ายชื่อที่ agent เขียนถูกรัน) · แอปเดินบน SVG ที่ได้แล้วผูก
   * handler เองจาก nodeMap ซึ่งทำงานเหมือนเดิมถึงเปลี่ยน engine
   */
  it('securityLevel เป็น strict และไม่มีที่ไหนสั่ง click ของ mermaid', () => {
    const engine = readFileSync(join(SRC, 'lib', 'diagram', 'engine-mermaid.ts'), 'utf8')
    expect(engine).toMatch(/securityLevel:\s*'strict'/)

    const loose = files.filter((file) =>
      /securityLevel:\s*'(loose|antiscript|sandbox)'/.test(readFileSync(file, 'utf8')),
    )
    expect(loose).toEqual([])

    // ไม่มีไฟล์ไหนแทรกบรรทัด `click …` เข้าไปใน source ก่อนส่งให้ engine
    const emitsClick = files.filter((file) => /['"`]\s*click\s+/.test(readFileSync(file, 'utf8')))
    expect(emitsClick).toEqual([])
  })

  it('handler ของ node มาจาก nodeMap ผ่าน onNodeClick', () => {
    const index = readFileSync(join(SRC, 'lib', 'diagram', 'index.ts'), 'utf8')
    expect(index).toMatch(/addEventListener\('click'/)
    expect(index).toMatch(/nodeMap\[nodeId\]/)
  })

  /**
   * server ตรวจ node id ของ nodeMap ด้วย parser ของ subset (pure, ไม่มี DOM) —
   * ห้ามลาก engine เข้าไปฝั่ง server ไม่งั้น "เปลี่ยน engine" กลายเป็นงานสองฝั่ง
   */
  it('ฝั่ง server ไม่แตะ mermaid หรือ engine เลย', () => {
    const serverDir = fileURLToPath(new URL('../server', import.meta.url))
    const leaks = walk(serverDir).filter((file) => {
      const text = readFileSync(file, 'utf8')
      return /from 'mermaid'|import\('mermaid'\)|lib\/diagram\/(index|engine|normalize|theme)/.test(text)
    })
    expect(leaks).toEqual([])
  })
})
