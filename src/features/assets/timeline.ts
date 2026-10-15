import { CHANGE_TYPE_LABELS, CONDITION_LABELS, labelOf } from '@/lib/constants'

import type { TimelineRow } from './api'

/**
 * One readable line for a Change Log row: who it went from and to, and what changed
 * ("Sales → Travel", "In Use → Lost / Stolen"). Locations are no longer shown (Sahan,
 * 15/10/2026: department is enough), even on older rows that recorded one.
 */
export function describeChange(r: TimelineRow): string {
  const who = (from?: string, to?: string) =>
    from && to ? `${from} → ${to}` : to ? `to ${to}` : from ? `from ${from}` : ''
  const people =
    r.change_type === 'department_changed'
      ? ''
      : who(r.from_employee?.full_name, r.to_employee?.full_name)
  const texts =
    r.from_text && r.to_text
      ? `${r.from_text} → ${r.to_text}`
      : (r.to_text ?? (r.from_text ? `was ${r.from_text}` : ''))
  return [people, texts].filter(Boolean).join(' · ')
}

export function changeTitle(r: TimelineRow): string {
  return labelOf(CHANGE_TYPE_LABELS, r.change_type)
}

/** "Condition Good · with Charger, Mouse · missing Bag" */
export function changeExtras(r: TimelineRow): string {
  return [
    r.condition && `Condition ${labelOf(CONDITION_LABELS, r.condition)}`,
    r.accessories.length > 0 && `with ${r.accessories.join(', ')}`,
    r.accessories_missing.length > 0 && `missing ${r.accessories_missing.join(', ')}`,
  ]
    .filter(Boolean)
    .join(' · ')
}
