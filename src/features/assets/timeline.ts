import { CHANGE_TYPE_LABELS, CONDITION_LABELS, labelOf } from '@/lib/constants'

import type { TimelineRow } from './api'

/** One readable line for a Change Log row: who/where it went from and to. */
export function describeChange(r: TimelineRow): string {
  const who = (from?: string, to?: string) =>
    from && to ? `${from} → ${to}` : to ? `to ${to}` : from ? `from ${from}` : ''
  const people = who(r.from_employee?.full_name, r.to_employee?.full_name)
  const fromLoc = r.from_location?.name
  const toLoc = r.to_location?.name
  const places =
    fromLoc && toLoc && fromLoc !== toLoc ? `${fromLoc} → ${toLoc}` : (toLoc ?? fromLoc ?? '')
  const texts = r.from_text || r.to_text ? `${r.from_text ?? ''} → ${r.to_text ?? ''}`.trim() : ''
  return [people, places, texts].filter(Boolean).join(' · ')
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
