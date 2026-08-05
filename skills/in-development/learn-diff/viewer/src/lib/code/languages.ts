import type { Extension } from '@codemirror/state'

import type { CodeLanguage } from '@/shared/languages'

/**
 * `language` ที่ file API ตอบมา → parser ของ CodeMirror
 *
 * import แบบ dynamic ทุกตัว: ผู้อ่านหนึ่งคนเปิดไม่กี่ภาษาต่อหนึ่ง run
 * ไม่มีเหตุผลที่จะโหลด grammar ของทุกภาษามาตั้งแต่เปิดหน้าแรก
 * ภาษาที่ไม่รู้จัก = null = แสดงเป็น plain text (ยังมีเลขบรรทัด/ค้นหาได้ตามปกติ)
 */
export async function languageExtension(id: CodeLanguage | null): Promise<Extension | null> {
  switch (id) {
    case 'javascript':
      return (await import('@codemirror/lang-javascript')).javascript()
    case 'jsx':
      return (await import('@codemirror/lang-javascript')).javascript({ jsx: true })
    case 'typescript':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: true })
    case 'tsx':
      return (await import('@codemirror/lang-javascript')).javascript({ jsx: true, typescript: true })
    case 'python':
      return (await import('@codemirror/lang-python')).python()
    case 'json':
      return (await import('@codemirror/lang-json')).json()
    case 'css':
      return (await import('@codemirror/lang-css')).css()
    case 'html':
      return (await import('@codemirror/lang-html')).html()
    case 'markdown':
      return (await import('@codemirror/lang-markdown')).markdown()
    case 'sql':
      return (await import('@codemirror/lang-sql')).sql()
    case 'vue':
      return (await import('@codemirror/lang-vue')).vue()
    case 'yaml':
      return (await import('@codemirror/lang-yaml')).yaml()
    default:
      return null
  }
}
