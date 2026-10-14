/**
 * The full Excel export: the same tabs and column headers as Sahan's workbook
 * (docs/BUILD_PLAN.md -> Spec: Excel export), so it opens looking like the file it replaced.
 *
 * Fault Log and Service Log keep the workbook's shape even when there is nothing in them.
 */
import { type FaultRow } from '@/features/faults/api'
import { FAULT_COLUMNS, faultRow } from '@/features/faults/filters'
import type { ServiceJobRow } from '@/features/service/api'
import { SERVICE_COLUMNS, serviceRows } from '@/features/service/filters'
import { assetRegisterRow, ASSET_REGISTER_COLUMNS } from '@/features/assets/filters'
import type { AssetListRow, TimelineRow } from '@/features/assets/api'
import { CHANGE_TYPE_LABELS, labelOf } from '@/lib/constants'
import { inOut, needsReorder } from '@/features/stock/stockForm'
import type { Sheet } from '@/lib/excel'
import { formatDate } from '@/lib/format'

export const CHANGE_LOG_COLUMNS = [
  'Log ID',
  'Date',
  'Asset Tag',
  'Change Type',
  'From',
  'To',
  'Reason / Details',
  'Handover Form No',
] as const

// The Fault Log and Service Log tabs use the same columns as their list pages' exports.
export const FAULT_LOG_COLUMNS = FAULT_COLUMNS
export const SERVICE_LOG_COLUMNS = SERVICE_COLUMNS

export const CONSUMABLES_COLUMNS = [
  'Item Code',
  'Item',
  'Qty Received',
  'Qty Issued',
  'In Stock',
  'Reorder Level',
  'Reorder?',
  'Notes',
] as const

export const DASHBOARD_COLUMNS = ['Measure', 'Value'] as const

export type ChangeLogExportRow = TimelineRow & {
  asset: { asset_tag: string } | null
}

/** "IT store → Desk 1" collapses to just the side that is set, as the workbook had it. */
function side(employee: string | undefined, location: string | undefined, text: string | null) {
  return employee ?? location ?? text ?? ''
}

export function changeLogRow(r: ChangeLogExportRow): (string | number)[] {
  return [
    r.change_no,
    formatDate(r.change_date),
    r.asset?.asset_tag ?? '',
    labelOf(CHANGE_TYPE_LABELS, r.change_type),
    side(r.from_employee?.full_name, r.from_location?.name, r.from_text),
    side(r.to_employee?.full_name, r.to_location?.name, r.to_text),
    r.reason ?? '',
    r.handover_form?.form_no ?? '',
  ]
}

export type StockRow = {
  id: number
  item_code: string
  name: string
  qty_on_hand: number
  reorder_level: number
  notes: string | null
}

/** Received and issued come from the stock movements; received - issued = in stock. */
export function consumablesRow(
  s: StockRow,
  totals: { received: number; issued: number } = { received: 0, issued: 0 },
): (string | number)[] {
  return [
    s.item_code,
    s.name,
    totals.received,
    totals.issued,
    s.qty_on_hand,
    s.reorder_level,
    needsReorder(s) ? 'REORDER' : 'OK',
    s.notes ?? '',
  ]
}

export type DashboardCounts = Record<string, number | null>
export type CategorySummaryRow = {
  category: string | null
  active_total: number | null
  in_use: number | null
  spare: number | null
  min_spares: number | null
  below_min: boolean | null
}

const DASHBOARD_LABELS: [string, string][] = [
  ['active_total', 'Active assets'],
  ['in_use', 'In Use'],
  ['spare_total', 'Spare'],
  ['faulty_or_repair', 'Faulty or Under Repair'],
  ['lost_stolen', 'Lost / Stolen'],
  ['in_use_without_holder', 'In Use with no person and no location'],
  ['categories_below_min', 'Categories below minimum spares'],
]

/** The dashboard as plain values: the totals, then a line per category. */
export function dashboardRows(
  totals: DashboardCounts | null,
  categories: CategorySummaryRow[],
): (string | number)[][] {
  const rows: (string | number)[][] = DASHBOARD_LABELS.filter(([key]) => totals?.[key] != null).map(
    ([key, label]) => [label, totals![key] as number],
  )
  if (categories.length) {
    rows.push(['', ''], ['By category', 'Active / In Use / Spare / Min spares'])
    for (const c of categories) {
      rows.push([
        c.category ?? '',
        `${c.active_total ?? 0} / ${c.in_use ?? 0} / ${c.spare ?? 0} / ${c.min_spares ?? 0}${
          c.below_min ? '  (below minimum)' : ''
        }`,
      ])
    }
  }
  return rows
}

export function buildSheets(data: {
  assets: AssetListRow[]
  changes: ChangeLogExportRow[]
  faults?: FaultRow[]
  jobs?: ServiceJobRow[]
  stock: StockRow[]
  movements?: { stock_item_id: number; qty_change: number }[]
  totals: DashboardCounts | null
  categories: CategorySummaryRow[]
}): Sheet[] {
  return [
    {
      name: 'Asset Register',
      columns: ASSET_REGISTER_COLUMNS,
      rows: data.assets.map(assetRegisterRow),
    },
    { name: 'Change Log', columns: CHANGE_LOG_COLUMNS, rows: data.changes.map(changeLogRow) },
    {
      name: 'Fault Log',
      columns: FAULT_LOG_COLUMNS,
      // Oldest first, like the workbook, so FLT-0001 is the first row.
      rows: [...(data.faults ?? [])].reverse().map(faultRow),
    },
    {
      name: 'Service Log',
      columns: SERVICE_LOG_COLUMNS,
      rows: serviceRows([...(data.jobs ?? [])].reverse()),
    },
    {
      name: 'Consumables',
      columns: CONSUMABLES_COLUMNS,
      rows: data.stock.map((s) =>
        consumablesRow(s, inOut((data.movements ?? []).filter((m) => m.stock_item_id === s.id))),
      ),
    },
    {
      name: 'Dashboard',
      columns: DASHBOARD_COLUMNS,
      rows: dashboardRows(data.totals, data.categories),
    },
  ]
}
