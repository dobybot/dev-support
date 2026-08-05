/**
 * สีของไดอะแกรม — ข้อมูลล้วน ไม่ import mermaid และไม่แตะ DOM
 *
 * ทำไมสีอยู่ที่ viewer ไม่ใช่ที่ agent: หน้าตาเป็นเรื่องของ viewer (เหมือน `style`/`linkStyle`
 * ที่ subset ห้ามไว้) ถ้าปล่อยให้ agent ใส่ hex เอง เราจะได้ไดอะแกรมที่สีเพี้ยนคนละแบบทุก run
 * และเปลี่ยนธีม/โหมดมืดทีเดียวทั้งระบบไม่ได้
 */

export interface DiagramPalette {
  /** สีพื้น/เส้น/ตัวหนังสือของ node ปกติ = "ของเดิมที่ไม่ถูกแตะ" */
  nodeBg: string
  nodeBorder: string
  nodeText: string
  /** เส้นเชื่อมและป้ายบนเส้น */
  line: string
  edgeLabelBg: string
  /** กรอบ subgraph */
  clusterBg: string
  clusterBorder: string
  /** class มาตรฐาน */
  changed: { fill: string; stroke: string; color: string }
  risk: { fill: string; stroke: string; color: string }
  external: { fill: string; stroke: string; color: string }
}

const LIGHT: DiagramPalette = {
  nodeBg: '#ffffff',
  nodeBorder: '#a3a3a3',
  nodeText: '#171717',
  line: '#737373',
  edgeLabelBg: '#ffffff',
  clusterBg: '#fafafa',
  clusterBorder: '#d4d4d4',
  changed: { fill: '#fef3c7', stroke: '#b45309', color: '#451a03' },
  risk: { fill: '#fee2e2', stroke: '#b91c1c', color: '#450a0a' },
  external: { fill: '#f5f5f5', stroke: '#a3a3a3', color: '#525252' },
}

const DARK: DiagramPalette = {
  nodeBg: '#262626',
  nodeBorder: '#737373',
  nodeText: '#f5f5f5',
  line: '#a3a3a3',
  edgeLabelBg: '#171717',
  clusterBg: '#1f1f1f',
  clusterBorder: '#404040',
  changed: { fill: '#422006', stroke: '#f59e0b', color: '#fef3c7' },
  risk: { fill: '#450a0a', stroke: '#f87171', color: '#fee2e2' },
  external: { fill: '#262626', stroke: '#737373', color: '#d4d4d4' },
}

export function palette(dark: boolean): DiagramPalette {
  return dark ? DARK : LIGHT
}

/**
 * classDef ของ class มาตรฐาน — ถูกแทรกให้อัตโนมัติ agent เขียนแค่ `class A,B changed`
 * (ถ้า source ประกาศ classDef ชื่อเดียวกันเอง ของ source ชนะ — ดู normalize.ts)
 */
export function builtinClassDefs(dark: boolean): Record<string, string> {
  const p = palette(dark)
  return {
    changed: `fill:${p.changed.fill},stroke:${p.changed.stroke},stroke-width:2px,color:${p.changed.color}`,
    risk: `fill:${p.risk.fill},stroke:${p.risk.stroke},stroke-width:2px,color:${p.risk.color}`,
    external: `fill:${p.external.fill},stroke:${p.external.stroke},stroke-width:1px,stroke-dasharray:4 3,color:${p.external.color}`,
  }
}
