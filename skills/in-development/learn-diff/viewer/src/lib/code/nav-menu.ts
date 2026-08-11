/**
 * เมนูเล็ก ๆ ที่โผล่ตรงจุดกดค้าง (issue #43) — DOM ล้วน ไม่รู้จัก CodeMirror และไม่รู้จัก React
 *
 * ทำไมไม่ทำเป็น React component: ตัวที่ตัดสินใจเปิดคือ extension ของ CodeMirror ซึ่งอยู่หลังกำแพง
 * (ดู navigation.ts) การส่งสัญญาณข้ามไปฝั่ง React แล้วส่งพิกัดกลับมาเปิดทับ editor คือทางอ้อมที่
 * ยาวกว่าและมีสถานะให้พังมากกว่า — เมนูนี้ไม่มี state อะไรนอกจาก "เปิดอยู่หรือเปล่า"
 *
 * ที่นี่ **ไม่มี logic ของ navigation เลย** ทุกคำสั่งเป็น callback ที่ผู้เรียกส่งมา ซึ่งวิ่งเข้า
 * `dispatchNav()` ตัวเดียวกับ F12 / Cmd-click (ข้อกำหนดของสเปก: ไม่มีเส้นทางที่สองหลังจุดนี้)
 */

export interface NavMenuItem {
  label: string
  /** ปุ่มลัดของคำสั่งเดียวกันบน desktop — บอกไว้ให้คนที่สลับไปมาระหว่างเครื่องเห็นว่าคือของอันเดียวกัน */
  hint: string
  /** false = ทำไม่ได้แล้ว (เอกสารเปลี่ยนไประหว่างเมนูเปิดอยู่) — เมนูจะบอกแทนที่จะปิดเงียบ ๆ */
  run: () => boolean
}

export interface NavMenuOptions {
  /** พิกัด client ของจุดที่กดค้าง */
  x: number
  y: number
  symbol: string
  items: NavMenuItem[]
}

/**
 * ช่วงเวลาที่เมนู "ยังไม่รับคำสั่ง" หลังเปิด — นิ้วที่กดค้างยังไม่ยกขึ้น พอยกแล้วเบราว์เซอร์จะยิง
 * click ตามมาที่ตำแหน่งเดิม ซึ่งตอนนั้นมีปุ่มมารออยู่พอดี ถ้าไม่กันไว้เมนูจะเลือกข้อแรกให้เอง
 */
const GRACE_MS = 300

/** ระยะห่างจากนิ้ว เพื่อให้เห็นเมนูทั้งอันไม่โดนนิ้วบัง */
const OFFSET_PX = 12

const EDGE_MARGIN_PX = 8

let current: { el: HTMLElement; dispose: () => void } | null = null

export function closeNavMenu(): void {
  current?.dispose()
}

/** เปิดเมนู (ปิดอันเก่าถ้ามี) — คืนฟังก์ชันปิดสำหรับผู้เรียกที่ต้องเก็บกวาดตอนตัวเองตาย */
export function openNavMenu(options: NavMenuOptions): () => void {
  closeNavMenu()

  const el = document.createElement('div')
  el.className = 'ld-nav-menu'
  el.setAttribute('role', 'menu')

  const head = document.createElement('p')
  head.className = 'ld-nav-menu-head'
  head.textContent = options.symbol
  el.appendChild(head)

  const readyAt = Date.now() + GRACE_MS
  let alive = true

  const dispose = (): void => {
    if (!alive) return
    alive = false
    document.removeEventListener('pointerdown', onOutside, true)
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('scroll', dispose, true)
    window.removeEventListener('resize', dispose)
    el.remove()
    if (current?.el === el) current = null
  }

  function onOutside(event: PointerEvent): void {
    if (event.target instanceof Node && el.contains(event.target)) return
    dispose()
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    dispose()
  }

  for (const item of options.items) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'ld-nav-menu-item'
    button.setAttribute('role', 'menuitem')

    const label = document.createElement('span')
    label.textContent = item.label
    const hint = document.createElement('span')
    hint.className = 'ld-nav-menu-hint'
    hint.textContent = item.hint
    button.append(label, hint)

    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (Date.now() < readyAt) return
      if (item.run()) {
        dispose()
        return
      }
      // สั่งแล้วไม่เกิดอะไรคือความล้มเหลวที่เงียบที่สุด — บอกไปตรง ๆ แล้วค่อยปิดเอง
      head.textContent = 'ตำแหน่งนี้ใช้ไม่ได้แล้ว — ลองกดค้างใหม่'
      head.classList.add('ld-nav-menu-head-error')
      window.setTimeout(dispose, 1600)
    })
    el.appendChild(button)
  }

  // วัดตัวเองนอกจอก่อน ค่อยย้ายมาที่จุดกด — วางแล้วค่อยวัดทำให้หน้ากระตุก/มี scrollbar แว่บหนึ่ง
  el.style.left = '-9999px'
  el.style.top = '0'
  document.body.appendChild(el)

  // วัดขนาดจริงก่อนค่อยวาง: เมนูที่โผล่ครึ่งตัวนอกจอบนมือถือคือเมนูที่กดไม่ได้
  const rect = el.getBoundingClientRect()
  const maxX = window.innerWidth - rect.width - EDGE_MARGIN_PX
  const maxY = window.innerHeight - rect.height - EDGE_MARGIN_PX
  el.style.left = `${Math.max(EDGE_MARGIN_PX, Math.min(options.x + OFFSET_PX, maxX))}px`
  el.style.top = `${Math.max(EDGE_MARGIN_PX, Math.min(options.y + OFFSET_PX, maxY))}px`

  document.addEventListener('pointerdown', onOutside, true)
  window.addEventListener('keydown', onKey, true)
  // เลื่อนหน้า/หมุนจอ = เมนูลอยไปคนละที่กับ symbol ที่กดค้าง — ปิดดีกว่าชี้ผิดที่
  window.addEventListener('scroll', dispose, true)
  window.addEventListener('resize', dispose)

  current = { el, dispose }
  return dispose
}
