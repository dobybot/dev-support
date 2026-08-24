/**
 * นามสกุลไฟล์ → ภาษาที่ใช้ทำ syntax highlighting
 *
 * shared เพราะ server เป็นคนตอบ `language` มากับ file API (app จะได้ไม่ต้องเดาเอง)
 * ส่วน app แปลง id ตัวนี้เป็น extension ของ CodeMirror ที่ src/lib/code/languages.ts
 * ภาษาที่ไม่รู้จัก = null = แสดงเป็น plain text (ไม่ใช่ error)
 */
export type CodeLanguage =
  | 'javascript'
  | 'jsx'
  | 'typescript'
  | 'tsx'
  | 'python'
  | 'json'
  | 'css'
  | 'html'
  | 'markdown'
  | 'sql'
  | 'vue'
  | 'yaml'

const BY_EXTENSION: Record<string, CodeLanguage> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  pyi: 'python',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'css',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  mdx: 'markdown',
  sql: 'sql',
  vue: 'vue',
  yaml: 'yaml',
  yml: 'yaml',
}

/** รับ path แบบ posix (เช่น `apps/api/src/main.py`) — ไม่แตะดิสก์ */
export function languageForPath(filePath: string): CodeLanguage | null {
  const base = filePath.split('/').pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return null
  const ext = base.slice(dot + 1).toLowerCase()
  return BY_EXTENSION[ext] ?? null
}
