import { FAULT_STATUS_LABELS, labelOf } from '@/lib/constants'
import { formatDate } from '@/lib/format'

import { type FaultRow, reporterName } from './api'

export type FaultFilters = {
  q: string
  /** 'open' (default: not Closed), 'closed', 'all', 'new_qr', or one status code. */
  status: string
  /** A category name, or ''. */
  category: string
}

export const EMPTY_FAULT_FILTERS: FaultFilters = { q: '', status: 'open', category: '' }

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

export function filterFaults(rows: FaultRow[], f: FaultFilters): FaultRow[] {
  const words = norm(f.q).split(' ').filter(Boolean)
  return rows.filter((r) => {
    if (f.status === 'new_qr' && !isNewFromQr(r)) return false
    if (f.status === 'open' && r.status === 'closed') return false
    if (f.status === 'closed' && r.status !== 'closed') return false
    if (!['open', 'closed', 'all', 'new_qr'].includes(f.status) && r.status !== f.status)
      return false
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

/** A report from a QR label that nobody has looked at yet: still Open and never edited. */
export const isNewFromQr = (f: Pick<FaultRow, 'source' | 'status' | 'updated_at'>) =>
  f.source === 'qr' && f.status === 'open' && f.updated_at === null

type Candidate = { id: string; full_name: string; status: string }

/**
 * People a typed name probably means, best first, for "is this Kamal Perera?" in one click.
 * An exact name beats every word of the typed name appearing in the person's name; a single
 * typed first name matches people whose first name it is. People who have left are not offered.
 */
export function suggestPeople<T extends Candidate>(typed: string, people: T[], limit = 3): T[] {
  const words = norm(typed).split(' ').filter(Boolean)
  if (!words.length) return []
  const scored = people
    .filter((p) => p.status === 'active')
    .map((p) => {
      const full = norm(p.full_name)
      const parts = full.split(' ')
      let score = 0
      if (full === words.join(' ')) score = 3
      else if (words.every((w) => parts.includes(w))) score = 2
      else if (words.length === 1 && parts[0] === words[0]) score = 1
      return { p, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.full_name.localeCompare(b.p.full_name))
  return scored.slice(0, limit).map((x) => x.p)
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
  ]
}

/** Money spent on repairs: faults fixed alone carry their own cost, service lines carry theirs. */
export function repairSpend(faults: Pick<FaultRow, 'cost'>[], serviceLineCosts: number[]): number {
  return (
    faults.reduce((sum, f) => sum + Number(f.cost), 0) +
    serviceLineCosts.reduce((sum, c) => sum + Number(c), 0)
  )
}
