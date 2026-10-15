import { describe, expect, it } from 'vitest'

import type { TimelineRow } from './api'
import { changeExtras, changeTitle, describeChange } from './timeline'

const row = (over: Partial<TimelineRow>): TimelineRow => ({
  id: 1,
  change_no: 'CHG-0001',
  change_date: '2026-10-01',
  change_type: 'issued',
  condition: 'good',
  accessories: [],
  accessories_missing: [],
  reason: null,
  from_text: null,
  to_text: null,
  created_at: '2026-10-01T04:00:00Z',
  from_employee: null,
  to_employee: null,
  from_location: null,
  to_location: null,
  handover_form: null,
  ...over,
})

describe('timeline lines', () => {
  it('describes an issue to a person, leaving out any old location', () => {
    const r = row({
      to_employee: { full_name: 'Test Person' },
      from_location: { name: 'IT store' },
      to_location: { name: 'Desk 1' },
    })
    expect(changeTitle(r)).toBe('Issued')
    expect(describeChange(r)).toBe('to Test Person')
  })

  it('describes the new kinds of row', () => {
    const dept = row({
      change_type: 'department_changed',
      to_employee: { full_name: 'Test Person' },
      from_text: 'Sales',
      to_text: 'Travel',
    })
    expect(changeTitle(dept)).toBe('Department Changed')
    expect(describeChange(dept)).toBe('Sales → Travel')
    const status = row({
      change_type: 'status_changed',
      from_text: 'In Use',
      to_text: 'Lost / Stolen',
    })
    expect(describeChange(status)).toBe('In Use → Lost / Stolen')
    const acc = row({ change_type: 'accessories_changed', from_text: null, to_text: 'Charger' })
    expect(describeChange(acc)).toBe('Charger')
  })

  it('describes a transfer between people', () => {
    const r = row({
      change_type: 'reassigned',
      from_employee: { full_name: 'A' },
      to_employee: { full_name: 'B' },
    })
    expect(describeChange(r)).toBe('A → B')
  })

  it('shows a move of department as text', () => {
    const r = row({ change_type: 'location_changed', from_text: 'Travel', to_text: 'Common' })
    expect(describeChange(r)).toBe('Travel → Common')
  })

  it('lists condition and accessories', () => {
    const r = row({ accessories: ['Charger'], accessories_missing: ['Mouse'] })
    expect(changeExtras(r)).toBe('Condition Good · with Charger · missing Mouse')
  })
})
