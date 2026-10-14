import { describe, expect, it } from 'vitest'

import type { PersonRow } from './api'
import { EMPTY_PEOPLE_FILTERS, filterPeople, peopleRow, PEOPLE_COLUMNS } from './filters'

// Fake people and NIDs only.
const person = (over: Partial<PersonRow>): PersonRow => ({
  id: 'p1',
  full_name: 'Test Person One',
  nid: '200012345678',
  department_id: 4,
  designation: 'Travel Agent',
  contact_no: '0770000000',
  default_location_id: 2,
  status: 'active',
  joined_on: '2025-01-15',
  left_on: null,
  notes: null,
  department: { name: 'Travel' },
  location: { name: 'Travel section / Desk 1' },
  held: [{ count: 2 }],
  ...over,
})

const ROWS = [
  person({}),
  person({
    id: 'p2',
    full_name: 'Test Person Two',
    nid: '901234567V',
    department_id: null,
    department: null,
  }),
  person({
    id: 'p3',
    full_name: 'Former Person',
    status: 'left',
    left_on: '2026-09-30',
    held: [{ count: 0 }],
  }),
]
const names = (r: PersonRow[]) => r.map((p) => p.full_name)

describe('filterPeople', () => {
  it('shows active people by default', () => {
    expect(names(filterPeople(ROWS, EMPTY_PEOPLE_FILTERS))).toEqual([
      'Test Person One',
      'Test Person Two',
    ])
    expect(names(filterPeople(ROWS, { ...EMPTY_PEOPLE_FILTERS, status: 'left' }))).toEqual([
      'Former Person',
    ])
  })
  it('searches name, NID and designation', () => {
    const q = (text: string) =>
      names(filterPeople(ROWS, { ...EMPTY_PEOPLE_FILTERS, status: 'all', q: text }))
    expect(q('901234567v')).toEqual(['Test Person Two'])
    expect(q('person two')).toEqual(['Test Person Two'])
    expect(q('agent')).toHaveLength(3)
  })
  it('filters by department, including none', () => {
    expect(names(filterPeople(ROWS, { ...EMPTY_PEOPLE_FILTERS, department: 'none' }))).toEqual([
      'Test Person Two',
    ])
  })
})

describe('people export', () => {
  it('has a row per column with labels and DD/MM/YYYY', () => {
    const row = peopleRow(ROWS[2])
    expect(row).toHaveLength(PEOPLE_COLUMNS.length)
    expect(row[PEOPLE_COLUMNS.indexOf('Status')]).toBe('Left')
    expect(row[PEOPLE_COLUMNS.indexOf('Left')]).toBe('30/09/2026')
    expect(peopleRow(ROWS[1])[PEOPLE_COLUMNS.indexOf('Department')]).toBe('')
  })
})
