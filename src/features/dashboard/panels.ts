import type { Tables } from '@/lib/database.types'
import { formatMoney } from '@/lib/format'

export type DueRow = Tables<'v_due_soon'>
export type CostRow = Tables<'v_asset_costs'>

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

/** "Warranty ends in 10 days", "Service due today", "Service overdue by 10 days". */
export function dueLabel(r: Pick<DueRow, 'kind' | 'days_left'>): string {
  const left = r.days_left ?? 0
  const what = r.kind === 'warranty' ? 'Warranty' : 'Service'
  if (r.kind === 'warranty') {
    return left === 0 ? 'Warranty ends today' : `Warranty ends in ${days(left)}`
  }
  if (left < 0) return `${what} overdue by ${days(-left)}`
  return left === 0 ? 'Service due today' : `Service due in ${days(left)}`
}

/** Overdue first (the most overdue at the top), then the soonest. */
export function sortDue<T extends Pick<DueRow, 'days_left'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0))
}

/** Why an asset is flagged, in the words Sahan uses: "55% of its replacement cost" / "3 faults in 12 months". */
export function flagReason(r: CostRow, months: number): string {
  const parts: string[] = []
  if (r.flag_spend) {
    parts.push(
      `repairs are ${r.spend_pct}% of its ${r.basis_source === 'purchase price' ? 'purchase price' : 'typical replacement cost'}`,
    )
  }
  if (r.flag_faults) parts.push(`${r.faults_last_12m} faults in ${months} months`)
  const text = parts.join('; ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Worst first: spend share, then fault count. */
export function sortFlagged<T extends Pick<CostRow, 'spend_pct' | 'faults_last_12m'>>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      (b.spend_pct ?? -1) - (a.spend_pct ?? -1) ||
      (b.faults_last_12m ?? 0) - (a.faults_last_12m ?? 0),
  )
}

export const spendText = (r: Pick<CostRow, 'repair_spend'>) =>
  formatMoney(r.repair_spend) || 'LKR 0'
