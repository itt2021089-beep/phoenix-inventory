import { cn } from '@/lib/utils'

/** The Phoenix emblem from the company logo. Decorative: the name always sits beside it. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo-mark.png"
      alt=""
      aria-hidden
      className={cn('size-8 shrink-0 object-contain', className)}
    />
  )
}
