import type { Plugin, ViteDevServer } from 'vite'

import { createApiHandler } from './api'
import { closeAllEventStreams } from './events'
import { configuredIdleMs, createIdleTimer, setActiveIdleTimer, type IdleTimer } from './lifecycle'
import { viewerRoot } from './paths'
import { closeAllWatchers } from './watch'

/** SSE ค้างสายไว้ตลอด — ต้องปิดเองตอน server ปิด ไม่งั้น process ไม่ยอมจบ */
function shutdown(): void {
  closeAllEventStreams()
  closeAllWatchers()
}

function humanDuration(ms: number): string {
  if (ms >= 3_600_000) {
    const hours = ms / 3_600_000
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} ชั่วโมง`
  }
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} นาที`
  return `${Math.round(ms / 1000)} วินาที`
}

/**
 * คำสั่งสั่งรันเองที่ผู้อ่านก็อปไปวางได้ — server ที่ปิดตัวเองแล้วต้องบอกทางกลับมาเสมอ
 * (user story 40) · path ของ Windows มี space ประจำ จึงต้องใส่เครื่องหมายคำพูดให้
 */
export function startCommand(root: string, platform: string = process.platform): string {
  if (platform === 'win32') return `pnpm --dir "${root}" dev`
  return `pnpm --dir ${root.includes(' ') ? `'${root}'` : root} dev`
}

/**
 * ตั้งเวลาปิดตัวเองเมื่อไม่มี request เข้ามานาน (SPEC-v3 → Lifecycle, user story 42)
 * ทุก request นับหมด ไม่ใช่เฉพาะ `/api` — การเปิดหน้าอ่านคือการใช้งาน แม้จะไม่ยิง API เลยก็ตาม
 */
function attachIdleShutdown(server: ViteDevServer, root: string): IdleTimer | null {
  const timeoutMs = configuredIdleMs()
  if (timeoutMs <= 0) return null

  const timer = createIdleTimer({
    timeoutMs,
    onIdle: () => {
      console.log(
        `\nlearn-diff viewer: ไม่มีใครเรียกมา ${humanDuration(timeoutMs)} — ปิดตัวเอง` +
          `\nสั่งรันใหม่ได้ด้วย: ${startCommand(root)}\n`,
      )
      shutdown()
      void server.close().finally(() => process.exit(0))
    },
  })
  setActiveIdleTimer(timer)
  server.middlewares.use((_req, _res, next) => {
    timer.touch()
    next()
  })
  return timer
}

/**
 * ต่อ content API เข้ากับ vite dev server
 * middleware ตัวเดียวกันนี้ถูกเทสต์ตรง ๆ ผ่าน node:http ใน test/api.test.ts
 */
export function learnDiffApi(): Plugin {
  const handler = createApiHandler()
  const root = viewerRoot()
  let timer: IdleTimer | null = null

  const stop = (): void => {
    timer?.stop()
    setActiveIdleTimer(null)
    timer = null
    shutdown()
  }

  return {
    name: 'learn-diff:api',
    configureServer(server) {
      // ตัวนับต้องอยู่หน้าสุด: request ที่ vite ตอบเอง (หน้า, asset, HMR) ก็คือการใช้งาน
      timer = attachIdleShutdown(server, root)
      server.middlewares.use(handler)
      server.httpServer?.on('close', stop)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
      server.httpServer?.on('close', stop)
    },
    closeBundle: stop,
  }
}
