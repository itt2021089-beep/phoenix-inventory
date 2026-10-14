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
