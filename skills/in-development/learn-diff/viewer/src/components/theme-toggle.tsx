import { Monitor, Moon, Sun } from 'lucide-react'

import { useThemePreference, type ThemePreference } from '@/lib/theme-preference'

const NEXT: Record<ThemePreference, ThemePreference> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
}

const LABEL: Record<ThemePreference, string> = {
  light: 'ธีมสว่าง',
  dark: 'ธีมมืด',
  system: 'ธีมตามระบบ',
}

/**
 * ปุ่มสลับธีม (issue #31) — ปุ่มเดียววน light → dark → system
 * (segmented control 3 ปุ่มถูกตัดออก — หนักเกินไปสำหรับ header ที่แน่นอยู่แล้ว)
 */
export function ThemeToggle() {
  const [pref, setPref] = useThemePreference()
  const Icon = pref === 'light' ? Sun : pref === 'dark' ? Moon : Monitor
  return (
    <button
      type="button"
      onClick={() => setPref(NEXT[pref])}
      title={`${LABEL[pref]} — กดเพื่อสลับเป็น${LABEL[NEXT[pref]]}`}
      className="rounded-md border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-4" aria-hidden />
      <span className="sr-only">{LABEL[pref]}</span>
    </button>
  )
}
