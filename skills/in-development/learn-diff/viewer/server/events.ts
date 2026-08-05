import type { IncomingMessage, ServerResponse } from 'node:http'

import type { RunChangeEvent, RunReadyEvent, RunSummary } from '../src/shared/types'
import { RUN_FILE } from './content'
import { watchContentDir } from './watch'

/** ยิง comment เป็นระยะ เพื่อให้ฝั่ง client รู้ว่าสายยังดีอยู่ (และกัน idle timeout ระหว่างทาง) */
const HEARTBEAT_MS = 25_000
/** ให้ EventSource ต่อใหม่เร็ว ๆ ถ้า server restart (vite reload ตัวเองบ่อยตอนแก้ viewer) */
const RETRY_MS = 2000

const streams = new Set<ServerResponse>()

function writeEvent(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

/**
 * SSE ของ run หนึ่ง: `GET /api/runs/<id>/events`
 *
 * ผู้อ่านเปิดหน้าไว้ระหว่างที่ agent ยังเขียนอยู่ — ทุกครั้งที่ไฟล์ใน content dir เปลี่ยน
 * server ยิง `change` พร้อมรายชื่อไฟล์ ให้ app ตัดสินใจเองว่าต้องโหลด run/หน้าไหนใหม่
 * (server ไม่ส่งเนื้อหามากับ event — หน้าที่เดียวของมันคือบอกว่า "มีอะไรเปลี่ยน")
 */
export function handleRunEvents(req: IncomingMessage, res: ServerResponse, run: RunSummary): void {
  res.statusCode = 200
  res.setHeader('content-type', 'text/event-stream; charset=utf-8')
  res.setHeader('cache-control', 'no-cache, no-transform')
  res.setHeader('connection', 'keep-alive')
  // ปิด buffering ของ proxy ที่อาจคั่นอยู่ — ไม่มีผลกับ vite dev server แต่ไม่เสียหาย
  res.setHeader('x-accel-buffering', 'no')
  res.flushHeaders?.()

  if (req.method === 'HEAD') {
    res.end()
    return
  }

  streams.add(res)
  res.write(`retry: ${RETRY_MS}\n\n`)

  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)
  heartbeat.unref?.()

  let unwatch: (() => void) | null = null
  let closed = false
  const cleanup = (): void => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    unwatch?.()
    streams.delete(res)
  }
  res.on('close', cleanup)
  res.on('error', cleanup)

  // `ready` ถูกส่งหลัง watcher จด snapshot ฐานเสร็จ — client จึงถือได้ว่า
  // "ตั้งแต่วินาทีที่เห็น ready ไป ไฟล์ที่เปลี่ยนจะมาเป็น change ครบทุกไฟล์"
  void watchContentDir(run.contentDir, (files) => {
    const change: RunChangeEvent = {
      runId: run.id,
      files,
      runFileChanged: files.includes(RUN_FILE),
      at: new Date().toISOString(),
    }
    writeEvent(res, 'change', change)
  }).then(
    (release) => {
      if (closed) {
        release()
        return
      }
      unwatch = release
      const ready: RunReadyEvent = {
        runId: run.id,
        contentDir: run.contentDir,
        at: new Date().toISOString(),
      }
      writeEvent(res, 'ready', ready)
    },
    () => {
      // เฝ้าโฟลเดอร์ไม่ได้ (เช่นถูกลบไปแล้ว) — บอกให้ชัดแล้วปิดสาย ดีกว่าค้างไว้เงียบ ๆ
      writeEvent(res, 'fatal', {
        runId: run.id,
        message: `เฝ้าโฟลเดอร์ ${run.contentDir} ไม่ได้`,
      })
      cleanup()
      res.end()
    },
  )
}

/** ปิดทุกสายที่ยังค้างอยู่ — ใช้ตอนปิด server และในเทสต์ (ไม่งั้น server.close() ค้าง) */
export function closeAllEventStreams(): void {
  for (const res of [...streams]) {
    try {
      res.end()
    } catch {
      // สายนั้นตายไปแล้ว ไม่มีอะไรต้องทำ
    }
  }
  streams.clear()
}
