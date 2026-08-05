/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { learnDiffApi } from './server/plugin'

// Bind 127.0.0.1 only: the server can read files from every repo that registered a run,
// so it must never be reachable from the network (SPEC-v3 → Delivery model).
//
// strictPort: หนึ่งเครื่อง = server ตัวเดียว พอร์ตเดียว (SPEC-v3 → Lifecycle) การให้ vite
// ขยับไปพอร์ตอื่นเองเมื่อพอร์ตไม่ว่างคือการแอบสร้าง instance ที่สอง ซึ่งเป็นสิ่งเดียวที่
// scripts/serve.mjs มีหน้าที่ป้องกัน — ชนแล้วต้องล้มดัง ๆ
// พอร์ตมาจาก LEARN_DIFF_PORT ไม่ใช่ argv เพราะการส่ง flag ผ่าน pnpm/npm run ข้าม platform
// เชื่อถือไม่ได้ (`pnpm run dev -- --port N` กลายเป็น `vite -- --port N` ซึ่ง vite ไม่สนใจ)
const port = Number(process.env.LEARN_DIFF_PORT ?? 5174)

export default defineConfig({
  plugins: [react(), tailwindcss(), learnDiffApi()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port,
    strictPort: true,
  },
  test: {
    // seam เดียวที่ automated test ยิงใส่คือ HTTP surface ของ server
    // ไม่มีเทสต์ระดับ component (SPEC-v3 → Testing Decisions)
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
