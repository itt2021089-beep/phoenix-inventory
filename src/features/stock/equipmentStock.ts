import { CONDITION_LABELS, labelOf } from '@/lib/constants'
import type { Category } from '@/lib/db'
import { formatDate } from '@/lib/format'

/** A Spare asset, with the purchase details the Stock page shows. */
export type EquipmentRow = {
  id: string
  asset_tag: string
  make: string | null
  model: string | null
  serial_number: string | null
  condition: string
  specification: string | null
  purchase_date: string | null
  purchase_price: number | null
  invoice_no: string | null
  warranty_until: string | null
  category_id: number
  category: { name: string } | null
  supplier: { name: string } | null
}

export type CategoryStock = {
  categoryId: number
  name: string
  rows: EquipmentRow[]
  minSpares: number
  /** Fewer Spares than the category's minimum. */
  short: boolean
}

/** Oldest delivery first (use it first), then by tag. Rows with no purchase date go last. */
export function compareForIssue(a: EquipmentRow, b: EquipmentRow): number {
  if (a.purchase_date !== b.purchase_date) {
    if (!a.purchase_date) return 1
    if (!b.purchase_date) return -1
    return a.purchase_date < b.purchase_date ? -1 : 1
  }
  return a.asset_tag.localeCompare(b.asset_tag)
}

/** Every word typed must appear somewhere in the row (tag, make, model, serial, vendor, invoice). */
export function matchesEquipment(row: EquipmentRow, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = [
    row.asset_tag,
    row.make,
    row.model,
    row.serial_number,
    row.supplier?.name,
    row.invoice_no,
    row.specification,
  ]
    .join(' ')
    .toLowerCase()
  return words.every((w) => hay.includes(w))
}

/**
 * Spare assets grouped by category. A category shows when it has Spares, or when it has a minimum
 * so that an empty shelf is visible rather than missing. `categoryId` narrows to one category.
 */
export function groupByCategory(
  rows: EquipmentRow[],
  categories: Category[],
  categoryId: number | null = null,
): CategoryStock[] {
  const byCategory = new Map<number, EquipmentRow[]>()
  for (const r of rows) byCategory.set(r.category_id, [...(byCategory.get(r.category_id) ?? []), r])
  return categories
    .filter((c) => (categoryId === null ? true : c.id === categoryId))
    .map((c) => {
      const list = (byCategory.get(c.id) ?? []).sort(compareForIssue)
      return {
        categoryId: c.id,
        name: c.name,
        rows: list,
        minSpares: c.min_spares ?? 0,
        short: list.length < (c.min_spares ?? 0),
      }
    })
    .filter((g) => g.rows.length > 0 || g.minSpares > 0)
}

export const EQUIPMENT_COLUMNS = [
  'Asset Tag',
  'Category',
  'Make',
  'Model',
  'Serial Number',
  'Vendor',
  'Invoice No',
  'Purchase Date',
  'Price (LKR)',
  'Warranty Until',
  'Condition',
] as const

export function equipmentRow(r: EquipmentRow): (string | number)[] {
  return [
    r.asset_tag,
    r.category?.name ?? '',
    r.make ?? '',
    r.model ?? '',
    r.serial_number ?? '',
    r.supplier?.name ?? '',
    r.invoice_no ?? '',
    formatDate(r.purchase_date),
    r.purchase_price ?? '',
    formatDate(r.warranty_until),
    labelOf(CONDITION_LABELS, r.condition),
  ]
}
