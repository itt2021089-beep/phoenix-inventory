import {
  ACTIVE_STATUSES,
  ASSET_STATUS_LABELS,
  COMMON,
  CONDITION_LABELS,
  labelOf,
} from '@/lib/constants'
import { formatDate } from '@/lib/format'

import type { AssetListRow } from './api'

export type AssetFilters = {
  /** Free text: tag, serial, person, NID, make or model. Never put in the URL (it may hold an NID). */
  q: string
  category: string
  /** A status code, 'active' (not Retired/Disposed, the default), 'needs_repair' (Faulty or
   *  Under Repair) or 'all'. */
  status: string
  /** A department id, 'common' (no department) or ''. */
  department: string
}

export const EMPTY_FILTERS: AssetFilters = {
  q: '',
  category: '',
  status: 'active',
  department: '',
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

export function filterAssets(rows: AssetListRow[], f: AssetFilters): AssetListRow[] {
  const words = norm(f.q).split(' ').filter(Boolean)
  return rows.filter((a) => {
    if (f.category && String(a.category_id) !== f.category) return false
    if (f.status === 'active' && !ACTIVE_STATUSES.includes(a.status as never)) return false
    if (f.status && f.status !== 'active' && f.status !== 'all' && a.status !== f.status)
      return false
    if (f.department === 'common' && a.department_id !== null) return false
    if (f.department && f.department !== 'common' && String(a.department_id) !== f.department)
      return false
    if (words.length) {
      const haystack = norm(
        [
          a.asset_tag,
          a.serial_number,
          a.make,
          a.model,
          a.employee?.full_name,
          a.employee?.nid,
          a.category?.name,
          a.department?.name,
        ].join(' '),
      )
      // Every word must match somewhere: "dell 5400" finds the Dell Latitude 5400.
      if (!words.every((w) => haystack.includes(w))) return false
    }
    return true
  })
}

/** Accessories + accessory note + notes, as the workbook's single Notes column had them. */
export function notesColumn(a: AssetListRow): string {
  const accessories = a.asset_accessories
    .map((x) => x.accessory_types?.name)
    .filter(Boolean)
    .sort()
    .join(', ')
  return [accessories, a.accessories_note, a.notes].filter(Boolean).join(' | ')
}

/** The Asset Register tab, with the workbook's own column headers (docs/BUILD_PLAN.md). */
export const ASSET_REGISTER_COLUMNS = [
  'Asset Tag',
  'Category',
  'Make',
  'Model',
  'Serial Number',
  'Status',
  'Condition',
  'Assigned To',
  'NID No.',
  'Department',
  'Date Assigned',
  'Specification',
  'Notes',
  'Open Faults',
  'Times Repaired',
] as const

export function assetRegisterRow(a: AssetListRow): (string | number)[] {
  return [
    a.asset_tag,
    a.category?.name ?? '',
    a.make ?? '',
    a.model ?? '',
    a.serial_number ?? '',
    labelOf(ASSET_STATUS_LABELS, a.status),
    labelOf(CONDITION_LABELS, a.condition),
    a.employee?.full_name ?? '',
    a.employee?.nid ?? '',
    a.department?.name ?? COMMON,
    formatDate(a.date_assigned),
    a.specification ?? '',
    notesColumn(a),
    // Faults arrive in Phase 2; until then there are none to count.
    0,
    0,
  ]
}

/** How the Assets list can be split into groups. '' is the plain list. */
export const GROUP_BY = {
  '': 'None',
  department: 'Department',
  person: 'Person',
  category: 'Category',
  status: 'Status',
} as const
export type GroupBy = keyof typeof GROUP_BY

export type AssetGroup = {
  key: string
  label: string
  /** For a person group, their employee id (to link to their page). */
  personId?: string
  rows: AssetListRow[]
  /** "3 Laptop · 2 Headset", or for a category group "4 In Use · 2 Spare". */
  summary: string
}

const STATUS_ORDER = Object.keys(ASSET_STATUS_LABELS)

/** Counts like "3 Laptop · 2 Headset", the biggest first. */
function countsText(values: string[]): string {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([v, n]) => `${n} ${v}`)
    .join(' · ')
}

/**
 * Splits the (already filtered) list into groups: by department (Common last), by the person
 * holding it (nobody last), by category or by status (in the usual status order). Each group carries a one-line summary of what is in it.
 */
export function groupAssets(rows: AssetListRow[], by: GroupBy): AssetGroup[] {
  if (!by) return []
  const keyOf = (a: AssetListRow): [key: string, label: string, last: boolean] => {
    switch (by) {
      case 'department':
        return a.department_id === null
          ? ['common', COMMON, true]
          : [String(a.department_id), a.department?.name ?? '', false]
      case 'person':
        return a.assigned_employee_id === null
          ? ['nobody', 'Not with anyone', true]
          : [a.assigned_employee_id, a.employee?.full_name ?? '', false]
      case 'category':
        return [String(a.category_id), a.category?.name ?? '', false]
      case 'status':
        return [a.status, labelOf(ASSET_STATUS_LABELS, a.status), false]
    }
  }

  const groups = new Map<string, { label: string; last: boolean; rows: AssetListRow[] }>()
  for (const a of rows) {
    const [key, label, last] = keyOf(a)
    const g = groups.get(key) ?? { label, last, rows: [] }
    g.rows.push(a)
    groups.set(key, g)
  }

  return [...groups]
    .sort(([ka, a], [kb, b]) => {
      if (a.last !== b.last) return a.last ? 1 : -1
      if (by === 'status') return STATUS_ORDER.indexOf(ka) - STATUS_ORDER.indexOf(kb)
      return a.label.localeCompare(b.label)
    })
    .map(([key, g]) => ({
      key,
      label: g.label,
      personId: by === 'person' && key !== 'nobody' ? key : undefined,
      rows: [...g.rows].sort((x, y) => x.asset_tag.localeCompare(y.asset_tag)),
      summary:
        by === 'category' || by === 'status'
          ? countsText(
              g.rows.map((a) =>
                by === 'category'
                  ? labelOf(ASSET_STATUS_LABELS, a.status)
                  : (a.category?.name ?? ''),
              ),
            )
          : countsText(g.rows.map((a) => a.category?.name ?? '')),
    }))
}
