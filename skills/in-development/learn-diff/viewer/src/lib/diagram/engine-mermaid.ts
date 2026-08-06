/**
 * engine ปัจจุบันของไดอะแกรม = mermaid
 *
 * **ไฟล์นี้เป็นที่เดียวในแอปที่ import mermaid ได้** (มีเทสต์บังคับไว้ที่ test/diagram.test.ts)
 * โค้ดอื่นเรียกผ่าน `renderDiagram()` ใน ./index.ts เท่านั้น — วันที่เปลี่ยน engine
 * จึงเป็นการเขียนไฟล์นี้ใหม่ไฟล์เดียว ไม่ต้องไล่แก้ทั้งแอป (SPEC-v3 → Diagrams)
 */

import type { MermaidConfig } from 'mermaid'

import { palette } from './theme'

/** โหลด mermaid แบบ dynamic — bundle ก้อนใหญ่จะได้ไม่ติดมากับหน้าแรก */
let loading: Promise<typeof import('mermaid').default> | null = null

function load() {
  if (!loading) loading = import('mermaid').then((mod) => mod.default)
  return loading
}

/**
 * "Noto Sans Thai" ต้องนำ stack และต้องเป็นตัวที่ bundle มากับแอป (import ใน index.css · #34)
 * — ถ้าปล่อยให้ตกไปใช้ฟอนต์ในเครื่อง แต่ละเครื่องได้ metric ไม่เท่ากัน กล่องที่ mermaid
 * คำนวณจะไม่พอดีกับข้อความที่วาดจริง (ข้อความถูกตัดขอบ) · ตัวสำรองท้าย stack มีไว้เฉพาะ
 * กรณีฟอนต์ bundle โหลดไม่ขึ้นจริง ๆ
 */
const FONT_STACK =
  '"Noto Sans Thai", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

/**
 * บังคับให้ฟอนต์ที่ใช้วัดข้อความโหลดเสร็จก่อน render (#34) — browser จะเริ่มโหลดฟอนต์
 * ก็ต่อเมื่อมีข้อความใช้มันแล้ว ถ้าไม่รอ mermaid อาจวัดขนาดด้วยฟอนต์ fallback
 * แล้วค่อยวาดด้วยฟอนต์จริงที่กว้างไม่เท่ากัน
 */
async function ensureFontsLoaded(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  try {
    // load ทั้ง glyph ไทยและละติน · น้ำหนักปกติกับหนา (mermaid ใช้ทั้งคู่ในป้ายชื่อ)
    await Promise.all([
      document.fonts.load('14px "Noto Sans Thai"', 'กขค ABC'),
      document.fonts.load('bold 14px "Noto Sans Thai"', 'กขค ABC'),
    ])
    await document.fonts.ready
  } catch {
    // โหลดฟอนต์พังไม่ควรทำให้ไดอะแกรมวาดไม่ได้ — ยอมวัดด้วย fallback ดีกว่าไม่มีรูป
  }
}

function config(dark: boolean): MermaidConfig {
  const p = palette(dark)
  return {
    startOnLoad: false,
    // strict = ไม่รัน script/HTML ที่ฝังมาในป้ายชื่อ · เนื้อหามาจาก agent เราไม่ไว้ใจอยู่ดี
    // และ `click` ของ mermaid (ที่ต้องใช้ loose) ก็ถูกห้ามใน subset อยู่แล้ว
    securityLevel: 'strict',
    // พังแล้วอย่าไปยัดรูประเบิดของ mermaid ลง DOM เอง — เราแสดง error เอง
    suppressErrorRendering: true,
    theme: 'base',
    fontFamily: FONT_STACK,
    themeVariables: {
      darkMode: dark,
      background: 'transparent',
      primaryColor: p.nodeBg,
      primaryBorderColor: p.nodeBorder,
      primaryTextColor: p.nodeText,
      secondaryColor: p.clusterBg,
      tertiaryColor: p.clusterBg,
      lineColor: p.line,
      textColor: p.nodeText,
      mainBkg: p.nodeBg,
      nodeBorder: p.nodeBorder,
      nodeTextColor: p.nodeText,
      clusterBkg: p.clusterBg,
      clusterBorder: p.clusterBorder,
      edgeLabelBackground: p.edgeLabelBg,
      titleColor: p.nodeText,
      fontSize: '14px',
    },
    flowchart: {
      htmlLabels: true,
      curve: 'basis',
      // false = SVG ออกมาขนาดจริง (ไม่ยืด/ย่อตามความกว้างคอลัมน์) แล้วเลื่อนดูเอาแทน
      useMaxWidth: false,
      padding: 10,
      nodeSpacing: 34,
      rankSpacing: 46,
      diagramPadding: 8,
    },
  }
}

/** วาด source เป็น SVG (string) · โยน error ถ้า mermaid อ่านไม่ออก */
export async function renderToSvg(
  id: string,
  source: string,
  options: { dark: boolean },
): Promise<string> {
  const [mermaid] = await Promise.all([load(), ensureFontsLoaded()])
  // initialize ทุกครั้งเพราะธีมสว่าง/มืดสลับได้ระหว่าง session — เป็นแค่การ merge config
  mermaid.initialize(config(options.dark))
  const { svg } = await mermaid.render(id, source)
  return svg
}

/**
 * ดึง node id ที่ agent เขียนไว้ ออกจาก element ใน SVG
 * mermaid ใส่ไว้ที่ `data-id` (บาง shape) หรือฝังใน dom id รูป `<diagram id>-flowchart-<id>-<n>`
 */
export function engineNodeId(el: Element): string | null {
  const dataId = el.getAttribute('data-id')
  if (dataId) return dataId
  const domId = el.getAttribute('id') ?? ''
  const match = /^(?:.*-)?flowchart-(.+)-\d+$/.exec(domId)
  return match ? match[1] : null
}

/** element ที่ถือ node หนึ่งตัวใน SVG ที่ engine วาดออกมา */
export function engineNodeElements(root: Element): Element[] {
  return Array.from(root.querySelectorAll('g.node'))
}
