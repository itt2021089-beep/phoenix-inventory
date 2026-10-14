import { FAULT_STATUS_LABELS, labelOf } from '@/lib/constants'
import { cn } from '@/lib/utils'

const STYLE: Record<string, string> = {
  open: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900',
  in_progress:
    'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900',
  with_vendor:
    'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900',
  closed: 'bg-muted text-muted-foreground',
}

export function FaultStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        STYLE[status] ?? 'bg-muted',
      )}
    >
      {labelOf(FAULT_STATUS_LABELS, status)}
    </span>
  )
}
