import type { Condition } from '@/lib/db'

/** One asset on the Issue screen. */
export type IssueLine = {
  assetId: string
  condition: Condition
  accessoryTypeIds: number[]
  /** 1-3 condition photos, uploaded after the issue is saved. */
  photos: File[]
}

export function issueItems(lines: IssueLine[]) {
  return lines.map((l) => ({
    asset_id: l.assetId,
    condition: l.condition,
    accessory_type_ids: [...new Set(l.accessoryTypeIds)].sort((a, b) => a - b),
  }))
}

export type NextStatus = 'spare' | 'under_repair' | 'faulty'

/** One asset on the Return screen. Accessories with it are each either returned or missing. */
export type ReturnLine = {
  assetId: string
  condition: Condition
  /** accessory_type_id -> returned (true) or missing (false) */
  accessories: Record<number, boolean>
  nextStatus: NextStatus
  faultDescription: string
  /** 1-3 condition photos, uploaded after the return is saved. */
  photos: File[]
}

export function returnItems(lines: ReturnLine[]) {
  return lines.map((l) => {
    const entries = Object.entries(l.accessories).map(([id, back]) => [Number(id), back] as const)
    return {
      asset_id: l.assetId,
      condition: l.condition,
      next_status: l.nextStatus,
      accessories_returned: entries.filter(([, back]) => back).map(([id]) => id),
      accessories_missing: entries.filter(([, back]) => !back).map(([id]) => id),
      ...(l.faultDescription.trim() ? { fault_description: l.faultDescription.trim() } : {}),
    }
  })
}

export type ReturnCondition = 'good' | 'damaged' | 'items_missing'

/**
 * The form's "Condition on return" box, worked out from the lines so nobody has to tick it:
 * anything Damaged -> damaged; else any accessory missing -> items missing; else good.
 */
export function overallReturnCondition(lines: ReturnLine[]): ReturnCondition {
  if (lines.some((l) => l.condition === 'damaged')) return 'damaged'
  if (lines.some((l) => Object.values(l.accessories).some((back) => !back))) return 'items_missing'
  return 'good'
}

/** Names of accessories marked missing, for the form's remarks ("Missing: Mouse (PBS-LAP-001)"). */
export function missingSummary(
  lines: ReturnLine[],
  tagOf: (assetId: string) => string,
  nameOf: (accessoryTypeId: number) => string,
): string {
  const parts = lines.flatMap((l) =>
    Object.entries(l.accessories)
      .filter(([, back]) => !back)
      .map(([id]) => `${nameOf(Number(id))} (${tagOf(l.assetId)})`),
  )
  return parts.length ? `Missing: ${parts.join(', ')}` : ''
}

/** The fields of a Spare asset the Issue screen's shortcuts need. */
type SpareLike = {
  id: string
  asset_tag: string
  category_id: number
  category: { name: string } | null
}

/**
 * One shortcut per category that still has a Spare not yet picked: "+ Laptop (2 spare)" adds
 * the lowest-numbered one, so the oldest spare goes out first. `issuedCount` (how many of each
 * category people hold now) puts the kinds that go to people first and marks the rest (an AC,
 * a router) as `rarelyIssued`, so the screen can tuck them away.
 */
export function spareShortcuts<T extends SpareLike>(
  spares: T[],
  pickedIds: string[],
  issuedCount: Map<number, number> = new Map(),
) {
  const byCategory = new Map<number, { name: string; next: T; count: number }>()
  for (const a of spares) {
    if (pickedIds.includes(a.id)) continue
    const g = byCategory.get(a.category_id)
    if (!g) byCategory.set(a.category_id, { name: a.category?.name ?? '', next: a, count: 1 })
    else {
      g.count += 1
      if (a.asset_tag.localeCompare(g.next.asset_tag, undefined, { numeric: true }) < 0) g.next = a
    }
  }
  return [...byCategory]
    .map(([id, g]) => ({ ...g, issued: issuedCount.get(id) ?? 0 }))
    .map((g) => ({ ...g, rarelyIssued: g.issued === 0 }))
    .sort((x, y) => y.issued - x.issued || x.name.localeCompare(y.name))
}

/**
 * How many of each stock item this issue takes: one per ticked accessory that is linked to stock
 * and is not already with the asset (the database counts the same way).
 */
export function stockNeeded(
  lines: { accessoryTypeIds: number[]; alreadyWith: number[] }[],
  stockItemOf: (accessoryTypeId: number) => number | null | undefined,
): Map<number, number> {
  const need = new Map<number, number>()
  for (const l of lines) {
    for (const t of new Set(l.accessoryTypeIds)) {
      const item = stockItemOf(t)
      if (item == null || l.alreadyWith.includes(t)) continue
      need.set(item, (need.get(item) ?? 0) + 1)
    }
  }
  return need
}
