import { STOCK_MOVEMENT_TYPE_LABELS, labelOf } from '@/lib/constants'
import type { StockMovementType } from '@/lib/db'
import { formatDate } from '@/lib/format'

/** What Sahan picks on the stock page. "Issue" here is a handout without a laptop. */
export type StockAction = 'received' | 'issued' | 'adjusted' | 'written_off'

export const STOCK_ACTION_LABELS: Record<StockAction, string> = {
  received: 'Receive',
  issued: 'Issue',
  adjusted: 'Adjust',
  written_off: 'Write off',
}

export type MovementDraft = {
  action: StockAction
  /** Whole number as typed, always positive; the action decides the sign. */
  qty: string
  /** Adjust only: count was higher (+) or lower (-) than the system said. */
  direction: 'up' | 'down'
  date: string
  vendorId: string
  unitCost: string
  employeeId: string
  departmentId: string
  reference: string
  notes: string
}

export const emptyMovement = (date: string, action: StockAction = 'received'): MovementDraft => ({
  action,
  qty: '',
  direction: 'down',
  date,
  vendorId: '',
  unitCost: '',
  employeeId: '',
  departmentId: '',
  reference: '',
  notes: '',
})

/** + for what comes in, - for what goes out. */
export function signedQty(d: Pick<MovementDraft, 'action' | 'qty' | 'direction'>): number {
  const n = Number(d.qty.trim())
  if (d.action === 'received') return n
  if (d.action === 'adjusted') return d.direction === 'up' ? n : -n
  return -n
}

/** What is wrong with the draft, in plain words, or null when it can be saved. */
export function validateMovement(d: MovementDraft, onHand: number): string | null {
  const n = Number(d.qty.trim())
  if (!d.qty.trim() || !Number.isInteger(n) || n <= 0) return 'Enter a whole number of 1 or more.'
  if (!d.date) return 'Pick the date.'
  const cost = d.unitCost.replace(/,/g, '').trim()
  if (cost && (!Number.isFinite(Number(cost)) || Number(cost) < 0))
    return 'The unit cost is not an amount.'
  const change = signedQty(d)
  if (onHand + change < 0)
    return `Only ${onHand} in stock, so ${-change} cannot be taken out. Stock never goes below 0.`
  if ((d.action === 'adjusted' || d.action === 'written_off') && !d.notes.trim())
    return d.action === 'adjusted'
      ? 'Say why the count was different (for example "Stock-take 14/10").'
      : 'Say why it is written off (for example "Broken").'
  return null
}

/** The row to insert into stock_movements. Fields that do not apply are left out. */
export function toMovementInsert(stockItemId: number, d: MovementDraft) {
  const cost = d.unitCost.replace(/,/g, '').trim()
  return {
    stock_item_id: stockItemId,
    movement_type: d.action as StockMovementType,
    qty_change: signedQty(d),
    movement_date: d.date,
    vendor_id: d.action === 'received' && d.vendorId ? Number(d.vendorId) : null,
    unit_cost: d.action === 'received' && cost ? Number(cost) : null,
    employee_id: d.action === 'issued' && d.employeeId ? d.employeeId : null,
    department_id: d.action === 'issued' && d.departmentId ? Number(d.departmentId) : null,
    reference: d.reference.trim() || null,
    notes: d.notes.trim() || null,
  }
}

/** The workbook's rule: REORDER when what is left is at or below the reorder level. */
export const needsReorder = (s: { qty_on_hand: number; reorder_level: number }) =>
  s.reorder_level > 0 && s.qty_on_hand <= s.reorder_level

/**
 * The workbook's "Qty Received" and "Qty Issued": everything that came in, and everything
 * that went out. Received - Issued always equals the quantity on hand.
 */
export function inOut(moves: { qty_change: number }[]): { received: number; issued: number } {
  let received = 0
  let issued = 0
  for (const m of moves) {
    if (m.qty_change > 0) received += m.qty_change
    else issued -= m.qty_change
  }
  return { received, issued }
}

export type MovementRow = {
  id: number
  stock_item_id: number
  movement_date: string
  movement_type: string
  qty_change: number
  unit_cost: number | null
  reference: string | null
  notes: string | null
  created_at: string
  employee: { full_name: string } | null
  department: { name: string } | null
  vendor: { name: string } | null
  change: { change_no: string; asset: { asset_tag: string } | null } | null
}

/** Who or where it went to, or came from, in a few words. */
export function movementParty(m: MovementRow): string {
  return (
    [m.employee?.full_name, m.department?.name, m.vendor?.name].filter(Boolean).join(' · ') || ''
  )
}

export const MOVEMENT_COLUMNS = [
  'Date',
  'Type',
  'Qty',
  'Who / Vendor',
  'Asset Tag',
  'Log ID',
  'Unit Cost (LKR)',
  'Reference',
  'Notes',
] as const

export function movementRow(m: MovementRow): (string | number)[] {
  return [
    formatDate(m.movement_date),
    labelOf(STOCK_MOVEMENT_TYPE_LABELS, m.movement_type),
    m.qty_change,
    movementParty(m),
    m.change?.asset?.asset_tag ?? '',
    m.change?.change_no ?? '',
    m.unit_cost ?? '',
    m.reference ?? '',
    m.notes ?? '',
  ]
}
