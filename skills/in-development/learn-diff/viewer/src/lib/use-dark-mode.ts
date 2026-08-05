import { useEffect, useState } from 'react'

/**
 * ธีมของแอปเป็น class `.dark` บน <html> — ต้องเฝ้าไว้ ไม่ใช่อ่านครั้งเดียว
 * เพราะตัว render ที่ทำงานกับ DOM ตรง ๆ (ไดอะแกรม, CodeMirror) bake สีไว้ในของที่วาดไปแล้ว
 */
export function useDarkMode(): boolean {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  )
  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setDark(root.classList.contains('dark')))
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return dark
}
