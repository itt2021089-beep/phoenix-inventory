import { ASSET_STATUS_LABELS, labelOf } from '@/lib/constants'
import { cn } from '@/lib/utils'

const STATUS_STYLE: Record<string, string> = {
  in_use:
    'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900',
  spare:
    'bg-green-50 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-900',
  under_repair:
    'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900',
  faulty:
    'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900',
  lost_stolen:
    'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900',
  retired: 'bg-muted text-muted-foreground',
  disposed: 'bg-muted text-muted-foreground',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        STATUS_STYLE[status] ?? 'bg-muted',
      )}
    >
      {labelOf(ASSET_STATUS_LABELS, status)}
    </span>
  )
}
