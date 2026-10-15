import { formatDate } from '@/lib/format'

import { heldCount, type PersonRow } from './api'

export type PeopleFilters = {
  /** Name, NID, designation or contact. Never put in the URL (it may hold an NID). */
  q: string
  /** 'active' (default), 'left' or 'all'. */
  status: string
  /** A department id, 'none', or ''. */
  department: string
}

export const EMPTY_PEOPLE_FILTERS: PeopleFilters = { q: '', status: 'active', department: '' }

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

export function filterPeople(rows: PersonRow[], f: PeopleFilters): PersonRow[] {
  const words = norm(f.q).split(' ').filter(Boolean)
  return rows.filter((p) => {
    if (f.status !== 'all' && p.status !== f.status) return false
    if (f.department === 'none' && p.department_id !== null) return false
    if (f.department && f.department !== 'none' && String(p.department_id) !== f.department)
      return false
    if (words.length) {
      const hay = norm([p.full_name, p.nid, p.designation, p.contact_no].join(' '))
      if (!words.every((w) => hay.includes(w))) return false
    }
    return true
  })
}

export const PEOPLE_COLUMNS = [
  'Name',
  'NID No.',
  'Department',
  'Designation',
  'Contact No.',
  'Status',
  'Joined',
  'Left',
  'Items Held',
] as const

export function peopleRow(p: PersonRow): (string | number)[] {
  return [
    p.full_name,
    p.nid,
    p.department?.name ?? '',
    p.designation ?? '',
    p.contact_no ?? '',
    p.status === 'left' ? 'Left' : 'Active',
    formatDate(p.joined_on),
    formatDate(p.left_on),
    heldCount(p),
  ]
}
