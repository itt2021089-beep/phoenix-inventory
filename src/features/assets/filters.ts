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
  /** A status code, 'active' (not Retired/Disposed, the default) or 'all'. */
  status: string
  /** A department id, 'common' (no department) or ''. */
  department: string
  location: string
}

export const EMPTY_FILTERS: AssetFilters = {
  q: '',
  category: '',
  status: 'active',
  department: '',
  location: '',
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
    if (f.location && String(a.location_id) !== f.location) return false
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
          a.location?.name,
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
  'Location / Desk',
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
    a.location?.name ?? '',
    formatDate(a.date_assigned),
    a.specification ?? '',
    notesColumn(a),
    // Faults arrive in Phase 2; until then there are none to count.
    0,
    0,
  ]
}
