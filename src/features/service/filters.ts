import { SERVICE_JOB_TYPE_LABELS, labelOf } from '@/lib/constants'
import { formatDate } from '@/lib/format'

import type { ServiceJobRow } from './api'

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

export function filterJobs(rows: ServiceJobRow[], q: string, jobType: string): ServiceJobRow[] {
  const words = norm(q).split(' ').filter(Boolean)
  return rows.filter((j) => {
    if (jobType && j.job_type !== jobType) return false
    if (!words.length) return true
    const hay = norm(
      [
        j.job_no,
        j.vendor?.name,
        j.invoice_no,
        j.notes,
        ...j.lines.flatMap((l) => [l.asset?.asset_tag, l.work_done, l.asset?.location?.name]),
      ].join(' '),
    )
    return words.every((w) => hay.includes(w))
  })
}

export const jobCost = (j: ServiceJobRow): number =>
  j.lines.reduce((sum, l) => sum + Number(l.cost), 0)

/** The workbook's Service Log tab: one row per line (docs/BUILD_PLAN.md, Spec: Excel export). */
export const SERVICE_COLUMNS = [
  'Job No',
  'Date',
  'Vendor',
  'Type',
  'Asset Tag',
  'Location',
  'Work Done',
  'Cost (LKR)',
  'Next Due',
] as const

export function serviceRows(jobs: ServiceJobRow[]): (string | number)[][] {
  return jobs.flatMap((j) =>
    j.lines.map((l) => [
      j.job_no,
      formatDate(j.service_date),
      j.vendor?.name ?? '',
      labelOf(SERVICE_JOB_TYPE_LABELS, j.job_type),
      l.asset?.asset_tag ?? '',
      l.asset?.location?.name ?? '',
      l.work_done,
      Number(l.cost),
      formatDate(l.next_due_date),
    ]),
  )
}
