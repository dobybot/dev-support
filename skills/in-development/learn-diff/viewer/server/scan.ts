/**
 * อ่าน markdown ของหน้าหนึ่งหน้าเพื่อหา "สิ่งที่อ้างถึงของอื่น" — ใช้ตอน validate ฝั่ง server
 *
 * สิ่งที่ต้องรู้จากเนื้อความมีแค่สามอย่าง: ไดอะแกรม (เอา node id), `:read[...]` (อ้าง reading list)
 * และ `:file[...]` (อ้างไฟล์+ช่วงบรรทัด) · ที่นี่จึงเป็นตัวสแกนแบบบรรทัดต่อบรรทัด ไม่ใช่ remark เต็มตัว
 * เหตุผล: server ไม่ต้อง render markdown เลย การลาก unified/remark เข้ามาแค่เพื่อหา 3 อย่างนี้
 * แปลว่า pipeline ของ app กับของ server ต้องเดินตามกันตลอดไป
 *
 * สิ่งที่ต้องระวังคือ **false positive**: warning ที่ไม่จริงแย่พอ ๆ กับไม่มี warning
 * ตัวสแกนจึงข้าม fenced code block และ inline code (`` `:read[...]` `` ในเอกสารตัวอย่าง
 * ต้องไม่ถูกนับเป็นการอ้างถึงจริง)
 */

export interface ProseFileRef {
  path: string
  /** ค่าดิบของ `lines` (เช่น `"61-79"`) — null = ไม่ได้ระบุช่วง */
  lines: string | null
}

export interface PageScan {
  /** source ของทุก ```mermaid ในหน้านี้ */
  diagrams: string[]
  /** reading list id ที่ `:read[...]{list="…"}` อ้างถึง */
  readingLists: string[]
  /** ไฟล์ที่ `:file[...]{path="…" lines="…"}` อ้างถึง */
  files: ProseFileRef[]
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/
const ATTR_RE = /([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]+))/g

/** `:read` / `:file` เท่านั้น — `::verify` กับ `:::note` ขึ้นต้นด้วยโคลอนมากกว่านี้ */
const READ_RE = /(?<!:):read(?:\[[^\]]*\])?\{([^}]*)\}/g
const FILE_RE = /(?<!:):file(?:\[[^\]]*\])?\{([^}]*)\}/g

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const match of raw.matchAll(ATTR_RE)) {
    out[match[1]] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return out
}

export function scanPage(markdown: string): PageScan {
  const scan: PageScan = { diagrams: [], readingLists: [], files: [] }
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')

  /** marker ของ fence ที่เปิดค้างอยู่ (null = อยู่นอก fence) */
  let fence: string | null = null
  let mermaid: string[] | null = null

  for (const line of lines) {
    const fenceMatch = FENCE_RE.exec(line)
    if (fence !== null) {
      // ปิดได้ด้วย marker ชนิดเดียวกันที่ยาวไม่น้อยกว่าตอนเปิด และห้ามมีอย่างอื่นต่อท้าย
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length && fenceMatch[2].trim() === '') {
        if (mermaid) scan.diagrams.push(mermaid.join('\n'))
        fence = null
        mermaid = null
        continue
      }
      if (mermaid) mermaid.push(line)
      continue
    }
    if (fenceMatch) {
      fence = fenceMatch[1]
      // info string ตัวแรกคือภาษา ที่เหลือเป็น meta (title="…" lines="…")
      mermaid = fenceMatch[2].trim().split(/\s+/)[0] === 'mermaid' ? [] : null
      continue
    }

    // inline code ไม่ใช่การอ้างถึงจริง — ตัดทิ้งก่อนค่อยหา directive
    const text = line.replace(/`[^`]*`/g, ' ')
    for (const match of text.matchAll(READ_RE)) {
      const list = attrs(match[1]).list
      if (list) scan.readingLists.push(list)
    }
    for (const match of text.matchAll(FILE_RE)) {
      const a = attrs(match[1])
      if (a.path) scan.files.push({ path: a.path, lines: a.lines || null })
    }
  }

  // fence ที่ยังไม่ปิด (หน้าที่ agent เขียนค้างอยู่) — เอาที่ได้มาก่อน ดีกว่าทิ้งทั้งก้อน
  if (mermaid && mermaid.length > 0) scan.diagrams.push(mermaid.join('\n'))
  return scan
}
