import { CONDITION_LABELS, labelOf } from '@/lib/constants'
import type { Holding } from '@/features/people/api'

export const CLEARANCE_MIN_ROWS = 5

export type ClearanceLine = {
  asset_tag: string
  item: string
  makeModel: string
  serial: string
  condition: string
  accessories: string
}

/** What a leaver still holds, one line per asset, with the accessories that came with it. */
export function clearanceLines(holdings: Holding[]): ClearanceLine[] {
  return [...holdings]
    .sort((a, b) => a.asset_tag.localeCompare(b.asset_tag))
    .map((h) => ({
      asset_tag: h.asset_tag,
      item: h.category?.name ?? '',
      makeModel: [h.make, h.model].filter(Boolean).join(' '),
      serial: h.serial_number ?? '',
      condition: labelOf(CONDITION_LABELS, h.condition),
      accessories: h.accessories
        .map((a) => a.accessory_types?.name)
        .filter(Boolean)
        .sort()
        .join(', '),
    }))
}

/** Blank rows after the real ones so IT can write in anything missing from the list. */
export function paddedLines(lines: ClearanceLine[]): (ClearanceLine | null)[] {
  return [...lines, ...Array<null>(Math.max(CLEARANCE_MIN_ROWS - lines.length, 0)).fill(null)]
}
