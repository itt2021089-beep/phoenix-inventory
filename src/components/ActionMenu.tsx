import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { cn } from '@/lib/utils'

import { Button } from './ui/button'

export type ActionMenuItem =
  | { label: string; icon?: React.ReactNode; to: string; danger?: boolean }
  | { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean }
  | 'separator'

/**
 * A "More actions" button that opens a short list. Closes on a choice, a click elsewhere or
 * Escape. Built here rather than adding a menu library for one button.
 */
export function ActionMenu({
  label = 'More actions',
  items,
}: {
  label?: string
  items: ActionMenuItem[]
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Drop separators at the ends and doubled up (when the items around one are hidden).
  const shown = items.filter(
    (it, i, all) =>
      it !== 'separator' || (i > 0 && i < all.length - 1 && all[i - 1] !== 'separator'),
  )

  return (
    <div ref={root} className="relative">
      <Button
        variant="outline"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <ChevronDown className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-52 rounded-md border bg-popover p-1 shadow-md sm:left-0 sm:right-auto"
        >
          {shown.map((it, i) => {
            if (it === 'separator') return <div key={`sep-${i}`} className="my-1 border-t" />
            const cls = cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground',
              it.danger && 'text-red-700 dark:text-red-400 [&_svg]:text-current',
            )
            return 'to' in it ? (
              <Link
                key={it.label}
                role="menuitem"
                to={it.to}
                className={cls}
                onClick={() => setOpen(false)}
              >
                {it.icon}
                {it.label}
              </Link>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={cls}
                onClick={() => {
                  setOpen(false)
                  it.onSelect()
                }}
              >
                {it.icon}
                {it.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
