import type { ServiceJobRow } from '@/features/service/api'
import { SERVICE_JOB_TYPE_LABELS, labelOf } from '@/lib/constants'
import { formatDate } from '@/lib/format'

type Cell = string | number

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
