import { describe, expect, it } from 'vitest'

import { draftToRow, toDraft } from './categoryDraft'

const ac = {
  id: 21,
  name: 'Air Conditioner',
  category_group: 'facilities',
  tag_prefix: 'ACU',
  next_tag_number: 1,
  min_spares: 0,
  typical_replacement_cost: null,
  service_interval_days: 90,
  is_active: true,
  custom_fields: [
    { key: 'btu', label: 'BTU', type: 'number' },
    { key: 'gas_type', label: 'Gas type', type: 'select', options: ['R32', 'R410A'] },
  ],
}

describe('category draft', () => {
  it('round-trips an existing category unchanged', () => {
    const { row, problems } = draftToRow(toDraft(ac))
    expect(problems).toEqual([])
    expect(row).toMatchObject({
      name: 'Air Conditioner',
      tag_prefix: 'ACU',
      service_interval_days: 90,
      typical_replacement_cost: null,
      custom_fields: [
        { key: 'btu', label: 'BTU', type: 'number', required: false },
        {
          key: 'gas_type',
          label: 'Gas type',
          type: 'select',
          options: ['R32', 'R410A'],
          required: false,
        },
      ],
    })
  })

  it('uppercases the prefix and parses money with commas', () => {
    const d = {
      ...toDraft(null),
      name: 'Tablet',
      tag_prefix: 'tab',
      typical_replacement_cost: '85,000',
    }
    const { row } = draftToRow(d)
    expect(row?.tag_prefix).toBe('TAB')
    expect(row?.typical_replacement_cost).toBe(85000)
  })

  it('lists every problem at once', () => {
    const d = {
      ...toDraft(null),
      name: '',
      tag_prefix: 'LA',
      min_spares: '-1',
      service_interval_days: '0',
    }
    expect(draftToRow(d).problems).toEqual([
      'Name is required.',
      'The prefix is exactly 3 letters, e.g. LAP.',
      'Min spares must be a whole number.',
      'Service interval must be at least 1 day, or blank for none.',
    ])
  })
})
