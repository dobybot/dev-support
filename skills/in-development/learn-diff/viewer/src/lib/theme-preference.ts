import { useCallback, useEffect, useState } from 'react'

/**
 * ธีมของแอป (issue #31) — ค่าเดียวทั้งแอป ไม่ใช่ต่อ run เพราะเป็นค่าของ "ผู้อ่าน"
 * (แบบเดียวกับ diff mode และความกว้าง panel)
 *
 * แหล่งความจริงคือ class `.dark` บน <html> — ฝั่ง render (mermaid, CodeMirror)
 * เฝ้า class นี้ผ่าน useDarkMode() อยู่แล้ว ที่นี่มีหน้าที่แค่ "ตั้ง" class ให้ถูก
 *
 * ⚠️ key และ logic การ resolve ต้องตรงกับ inline script ใน index.html
 * (script นั้นซ้ำโดยจงใจ — มัน import TS ไม่ได้ และต้องรันก่อน React mount กันจอวาบ)
 */
export type ThemePreference = 'light' | 'dark' | 'system'

export const THEME_KEY = 'learn-diff:theme'

export function readStoredTheme(storage: Pick<Storage, 'getItem'> | null): ThemePreference {
  const raw = storage?.getItem(THEME_KEY)
  return raw === 'light' || raw === 'dark' ? raw : 'system'
}

export function writeStoredTheme(storage: Pick<Storage, 'setItem'>, pref: ThemePreference): void {
  storage.setItem(THEME_KEY, pref)
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** resolve preference → ตั้ง/ถอด class `.dark` บน <html> */
export function applyTheme(pref: ThemePreference): void {
  const dark = pref === 'dark' || (pref === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

export function useThemePreference(): [ThemePreference, (pref: ThemePreference) => void] {
  const [pref, setPrefState] = useState<ThemePreference>(() =>
    readStoredTheme(typeof window === 'undefined' ? null : window.localStorage),
  )

  const setPref = useCallback((next: ThemePreference) => {
    setPrefState(next)
    writeStoredTheme(window.localStorage, next)
  }, [])

  useEffect(() => {
    applyTheme(pref)
    if (pref !== 'system') return
    // โหมด system: OS สลับธีมแล้วหน้าต้องตามทันทีโดยไม่ต้อง reload
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [pref])

  return [pref, setPref]
}
