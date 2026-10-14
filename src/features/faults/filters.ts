import { FAULT_CAUSE_LABELS, FAULT_STATUS_LABELS, labelOf } from '@/lib/constants'
import { formatDate } from '@/lib/format'

import { type FaultRow, reporterName } from './api'

export type FaultFilters = {
  q: string
  /** 'open' (default: not Closed), 'closed', 'all', or one status code. */
  status: string
  /** A category name, or ''. */
  category: string
}

export const EMPTY_FAULT_FILTERS: FaultFilters = { q: '', status: 'open', category: '' }

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

export function filterFaults(rows: FaultRow[], f: FaultFilters): FaultRow[] {
  const words = norm(f.q).split(' ').filter(Boolean)
  return rows.filter((r) => {
    if (f.status === 'open' && r.status === 'closed') return false
    if (f.status === 'closed' && r.status !== 'closed') return false
    if (!['open', 'closed', 'all'].includes(f.status) && r.status !== f.status) return false
    if (f.category && r.asset?.category?.name !== f.category) return false
    if (words.length) {
      const hay = norm(
        [
          r.fault_no,
          r.asset?.asset_tag,
          r.asset?.make,
          r.asset?.model,
          r.description,
          r.action_taken,
          reporterName(r),
          r.holder?.full_name,
          r.vendor?.name,
        ].join(' '),
      )
      if (!words.every((w) => hay.includes(w))) return false
    }
    return true
  })
}

/** The Excel workbook's Fault Log columns (docs/BUILD_PLAN.md, Spec: Excel export). */
export const FAULT_COLUMNS = [
  'Fault ID',
  'Asset Tag',
  'Date Reported',
  'Reported By',
  'Fault / Issue',
  'Action Taken',
  'Cost (LKR)',
  'Date Closed',
  'Status',
  'Remarks',
  'Vendor',
  'Under Warranty',
  'Cause',
  'Responsible',
] as const

export function faultRow(f: FaultRow): (string | number)[] {
  return [
    f.fault_no,
    f.asset?.asset_tag ?? '',
    formatDate(f.date_reported),
    reporterName(f),
    f.description,
    f.action_taken ?? '',
    f.cost,
    formatDate(f.date_closed),
    labelOf(FAULT_STATUS_LABELS, f.status),
    f.remarks ?? '',
    f.vendor?.name ?? '',
    f.under_warranty ? 'Yes' : 'No',
    f.cause ? labelOf(FAULT_CAUSE_LABELS, f.cause) : '',
    f.responsible?.full_name ?? '',
  ]
}

/** Money spent on repairs: faults fixed alone carry their own cost, service lines carry theirs. */
export function repairSpend(faults: Pick<FaultRow, 'cost'>[], serviceLineCosts: number[]): number {
  return (
    faults.reduce((sum, f) => sum + Number(f.cost), 0) +
    serviceLineCosts.reduce((sum, c) => sum + Number(c), 0)
  )
}
