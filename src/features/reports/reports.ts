import type { FaultRow } from '@/features/faults/api'
import type { ServiceJobRow } from '@/features/service/api'
import { FAULT_CAUSE_LABELS, SERVICE_JOB_TYPE_LABELS, labelOf } from '@/lib/constants'
import type { Tables } from '@/lib/database.types'
import { formatDate } from '@/lib/format'

import { flagReason } from '@/features/dashboard/panels'

type Cell = string | number

// ---- Repair or replace -------------------------------------------------------------------
export type CostRow = Tables<'v_asset_costs'>

export const REPLACE_COLUMNS = [
  'Asset Tag',
  'Category',
  'Make / Model',
  'Status',
  'Repair Spend (LKR)',
  'Replacement Basis (LKR)',
  'Basis',
  'Spend %',
  'Faults',
  'Flag',
] as const

/** Assets that have cost money or failed, worst first: flagged ones, then by spend share. */
export function replaceRows(rows: CostRow[]): CostRow[] {
  return rows
    .filter((r) => r.status !== 'retired' && r.status !== 'disposed')
    .filter((r) => r.flagged || (r.repair_spend ?? 0) > 0 || (r.faults_last_12m ?? 0) > 0)
    .sort(
      (a, b) =>
        Number(b.flagged) - Number(a.flagged) ||
        (b.spend_pct ?? -1) - (a.spend_pct ?? -1) ||
        (b.repair_spend ?? 0) - (a.repair_spend ?? 0),
    )
}

export function replaceCells(r: CostRow, months: number): Cell[] {
  return [
    r.asset_tag ?? '',
    r.category ?? '',
    [r.make, r.model].filter(Boolean).join(' '),
    r.status ?? '',
    r.repair_spend ?? 0,
    r.replacement_basis ?? '',
    r.basis_source ?? (r.no_basis ? 'none set' : ''),
    r.spend_pct ?? '',
    r.faults_last_12m ?? 0,
    r.flagged ? flagReason(r, months) : '',
  ]
}

// ---- Spend per department per month ------------------------------------------------------
export type SpendRow = Tables<'v_spend_monthly'>

export type SpendGrid = {
  departments: string[]
  /** Newest first, as YYYY-MM-01. */
  months: string[]
  cell: (month: string, department: string) => number
  monthTotal: (month: string) => number
  departmentTotal: (department: string) => number
  total: number
}

/** Months down, departments across; every cost, fault or service, in the month it belongs to. */
export function spendGrid(rows: SpendRow[]): SpendGrid {
  const departments = [...new Set(rows.map((r) => r.department ?? 'Common'))].sort((a, b) =>
    a === 'Common' ? 1 : b === 'Common' ? -1 : a.localeCompare(b),
  )
  const months = [...new Set(rows.map((r) => r.month ?? ''))].filter(Boolean).sort().reverse()
  const sum = (f: (r: SpendRow) => boolean) =>
    rows.filter(f).reduce((n, r) => n + Number(r.amount ?? 0), 0)
  return {
    departments,
    months,
    cell: (m, d) => sum((r) => r.month === m && (r.department ?? 'Common') === d),
    monthTotal: (m) => sum((r) => r.month === m),
    departmentTotal: (d) => sum((r) => (r.department ?? 'Common') === d),
    total: sum(() => true),
  }
}

/** '2026-03-01' -> 'Mar 2026'. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function spendColumns(g: SpendGrid): string[] {
  return ['Month', ...g.departments, 'Total (LKR)']
}
export function spendCells(g: SpendGrid): Cell[][] {
  const rows: Cell[][] = g.months.map((m) => [
    monthLabel(m),
    ...g.departments.map((d) => g.cell(m, d)),
    g.monthTotal(m),
  ])
  rows.push(['Total', ...g.departments.map((d) => g.departmentTotal(d)), g.total])
  return rows
}

// ---- Faults by cause ---------------------------------------------------------------------
export type CauseRow = { cause: string; faults: number; closed: number; cost: number }

/** Every fault counted under Sahan's finding; faults not yet investigated are "Not decided". */
export function faultsByCause(faults: Pick<FaultRow, 'cause' | 'status' | 'cost'>[]): CauseRow[] {
  const by = new Map<string, CauseRow>()
  for (const f of faults) {
    const cause = f.cause ? labelOf(FAULT_CAUSE_LABELS, f.cause) : 'Not decided'
    const row = by.get(cause) ?? { cause, faults: 0, closed: 0, cost: 0 }
    row.faults++
    if (f.status === 'closed') row.closed++
    row.cost += Number(f.cost)
    by.set(cause, row)
  }
  return [...by.values()].sort(
    (a, b) =>
      (a.cause === 'Not decided' ? 1 : 0) - (b.cause === 'Not decided' ? 1 : 0) ||
      b.faults - a.faults ||
      a.cause.localeCompare(b.cause),
  )
}
export const CAUSE_COLUMNS = ['Cause', 'Faults', 'Closed', 'Cost on faults (LKR)'] as const
export const causeCells = (r: CauseRow): Cell[] => [r.cause, r.faults, r.closed, r.cost]

// ---- Service history by vendor -----------------------------------------------------------
export type VendorRow = {
  vendor: string
  jobs: number
  lines: number
  cost: number
  lastDate: string
  jobList: ServiceJobRow[]
}

/** Jobs grouped by vendor (no vendor is "In-house"), newest job first within each. */
export function serviceByVendor(jobs: ServiceJobRow[]): VendorRow[] {
  const by = new Map<string, VendorRow>()
  for (const j of jobs) {
    const vendor = j.vendor?.name ?? 'In-house'
    const row = by.get(vendor) ?? { vendor, jobs: 0, lines: 0, cost: 0, lastDate: '', jobList: [] }
    row.jobs++
    row.lines += j.lines.length
    row.cost += j.lines.reduce((n, l) => n + Number(l.cost), 0)
    if (j.service_date > row.lastDate) row.lastDate = j.service_date
    row.jobList.push(j)
    by.set(vendor, row)
  }
  for (const r of by.values())
    r.jobList.sort((a, b) => b.service_date.localeCompare(a.service_date))
  return [...by.values()].sort((a, b) => b.cost - a.cost || a.vendor.localeCompare(b.vendor))
}
export const VENDOR_COLUMNS = [
  'Vendor',
  'Job No',
  'Date',
  'Type',
  'Assets',
  'Cost (LKR)',
  'Invoice No',
] as const
/** One row per job, so the export is the full service history of each vendor. */
export function vendorCells(rows: VendorRow[]): Cell[][] {
  return rows.flatMap((v) =>
    v.jobList.map((j) => [
      v.vendor,
      j.job_no,
      formatDate(j.service_date),
      labelOf(SERVICE_JOB_TYPE_LABELS, j.job_type),
      j.lines.length,
      j.lines.reduce((n, l) => n + Number(l.cost), 0),
      j.invoice_no ?? '',
    ]),
  )
}
