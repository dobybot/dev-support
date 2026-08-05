import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

/** รวม burst ของการเขียนไฟล์ให้เป็น event เดียว (agent เขียนทีละหลาย write) */
const DEBOUNCE_MS = 60
/**
 * fs.watch พลาดได้ในบางสภาพแวดล้อม (network volume, container bind mount) —
 * poll เบา ๆ ควบคู่ไปด้วย เพื่อให้ "ไฟล์ใหม่โผล่เองโดยไม่ต้อง refresh" ไม่ขึ้นกับ fs.watch อย่างเดียว
 */
const POLL_MS = 2000

export type DirChangeListener = (files: string[]) => void

/** ชื่อไฟล์ → ลายเซ็น (mtime + size) ที่ใช้เทียบว่าเปลี่ยนจริงไหม */
type Snapshot = Map<string, string>

interface DirWatcher {
  listeners: Set<DirChangeListener>
  snapshot: Snapshot
  native: fs.FSWatcher | null
  poll: ReturnType<typeof setInterval>
  debounce: ReturnType<typeof setTimeout> | null
  /** กัน scan ซ้อนกัน — ถ้ามี event เข้ามาระหว่าง scan ให้ scan อีกรอบหลังจบ */
  scanning: boolean
  rescan: boolean
  /** scan รอบแรกคือการจดสภาพปัจจุบัน ไม่ใช่ "มีอะไรเปลี่ยน" — ห้ามยิง event */
  primed: boolean
  /** resolve เมื่อ priming scan จบ — ก่อนหน้านั้นยังไม่มีฐานให้เทียบ */
  ready: Promise<void>
}

const watchers = new Map<string, DirWatcher>()

async function takeSnapshot(dir: string): Promise<Snapshot> {
  const snapshot: Snapshot = new Map()
  let entries: fs.Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    // โฟลเดอร์ยังไม่มี/ถูกลบ = snapshot ว่าง (แล้วไฟล์ที่โผล่มาทีหลังจะนับเป็น "เพิ่ม")
    return snapshot
  }
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile()) return
      try {
        const stat = await fsp.stat(path.join(dir, entry.name))
        snapshot.set(entry.name, `${stat.mtimeMs}:${stat.size}`)
      } catch {
        // ไฟล์หายระหว่างอ่าน — รอบหน้าค่อยว่ากัน
      }
    }),
  )
  return snapshot
}

function diff(before: Snapshot, after: Snapshot): string[] {
  const changed = new Set<string>()
  for (const [name, sig] of after) {
    if (before.get(name) !== sig) changed.add(name)
  }
  for (const name of before.keys()) {
    if (!after.has(name)) changed.add(name)
  }
  return [...changed].sort()
}

async function scan(dir: string, watcher: DirWatcher): Promise<void> {
  if (watcher.scanning) {
    watcher.rescan = true
    return
  }
  watcher.scanning = true
  try {
    do {
      watcher.rescan = false
      const next = await takeSnapshot(dir)
      const files = diff(watcher.snapshot, next)
      watcher.snapshot = next
      if (!watcher.primed) {
        watcher.primed = true
      } else if (files.length > 0) {
        for (const listener of [...watcher.listeners]) listener(files)
      }
    } while (watcher.rescan)
  } finally {
    watcher.scanning = false
  }
}

function schedule(dir: string, watcher: DirWatcher): void {
  if (watcher.debounce) clearTimeout(watcher.debounce)
  watcher.debounce = setTimeout(() => {
    watcher.debounce = null
    void scan(dir, watcher)
  }, DEBOUNCE_MS)
  watcher.debounce.unref?.()
}

function createWatcher(dir: string): DirWatcher {
  const watcher: DirWatcher = {
    listeners: new Set(),
    snapshot: new Map(),
    native: null,
    poll: setInterval(() => void scan(dir, watcher), POLL_MS),
    debounce: null,
    scanning: false,
    rescan: false,
    primed: false,
    ready: Promise.resolve(),
  }
  watcher.poll.unref?.()

  try {
    // persistent: false — watcher ต้องไม่ค้าง process ไว้ (สำคัญกับเทสต์และตอน server ปิดตัวเอง)
    watcher.native = fs.watch(dir, { persistent: false }, () => schedule(dir, watcher))
    watcher.native.on('error', () => {
      // fs.watch ตายก็ยังเหลือ poll — ไม่ใช่เหตุให้ stream ล่ม
      watcher.native?.close()
      watcher.native = null
    })
  } catch {
    watcher.native = null
  }

  // priming scan: จดสภาพปัจจุบันไว้เป็นฐานเทียบ โดยไม่ยิง event
  watcher.ready = scan(dir, watcher)
  return watcher
}

function closeWatcher(watcher: DirWatcher): void {
  if (watcher.debounce) clearTimeout(watcher.debounce)
  clearInterval(watcher.poll)
  watcher.native?.close()
  watcher.native = null
}

/**
 * เฝ้า content dir ของ run หนึ่ง แล้วเรียก listener พร้อมรายชื่อไฟล์ที่เปลี่ยน
 *
 * watcher ถูกแชร์ต่อ 1 โฟลเดอร์ (เปิดหลายแท็บ = watcher ตัวเดียว) และปิดตัวเองเมื่อไม่มีคนฟังแล้ว
 * คืน unsubscribe ที่เรียกซ้ำได้อย่างปลอดภัย
 *
 * เป็น async เพราะต้องรอ snapshot ฐานให้เสร็จก่อน — ถ้าคืนก่อน ไฟล์ที่ถูกเขียนในจังหวะนั้น
 * จะถูกจดเป็น "สภาพเดิม" แล้วหายไปเงียบ ๆ แทนที่จะกลายเป็น change event
 */
export async function watchContentDir(
  dir: string,
  listener: DirChangeListener,
): Promise<() => void> {
  const key = path.resolve(dir)
  let watcher = watchers.get(key)
  if (!watcher) {
    watcher = createWatcher(key)
    watchers.set(key, watcher)
  }
  watcher.listeners.add(listener)
  await watcher.ready

  let released = false
  return () => {
    if (released) return
    released = true
    const current = watchers.get(key)
    if (!current) return
    current.listeners.delete(listener)
    if (current.listeners.size === 0) {
      watchers.delete(key)
      closeWatcher(current)
    }
  }
}

/** ปิด watcher ทั้งหมด — ใช้ตอน server ปิดตัวและในเทสต์ */
export function closeAllWatchers(): void {
  for (const watcher of watchers.values()) closeWatcher(watcher)
  watchers.clear()
}
