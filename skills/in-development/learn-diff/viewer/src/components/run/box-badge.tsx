import type { BoxLevel } from '@/shared/types'
import { cn } from '@/lib/utils'

const LABEL: Record<BoxLevel, string> = {
  blackbox: '⬛ blackbox',
  greybox: '🔲 greybox',
  whitebox: '⬜ whitebox',
}

const STYLE: Record<BoxLevel, string> = {
  blackbox: 'bg-neutral-900 text-neutral-100 border-neutral-900',
  greybox: 'bg-neutral-200 text-neutral-900 border-neutral-300',
  whitebox: 'bg-white text-neutral-900 border-neutral-400',
}

/** ป้ายระดับความลึกของกล่อง — ใช้ทั้งใน box map และหัว section */
export function BoxBadge({ box, className }: { box: BoxLevel; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        STYLE[box],
        className,
      )}
    >
      {LABEL[box]}
    </span>
  )
}
