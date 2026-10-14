import { describe, expect, it } from 'vitest'

import type { Holding } from '@/features/people/api'

import { clearanceLines, paddedLines } from './clearance'

const h = (over: Partial<Holding>): Holding => ({
  id: 'x',
  asset_tag: 'PBS-LAP-001',
  make: 'Dell',
  model: 'Latitude 5400',
  serial_number: 'SN-1',
  condition: 'good',
  date_assigned: null,
  category: { name: 'Laptop' },
  location: null,
  accessories: [
    { accessory_type_id: 2, accessory_types: { name: 'Mouse' } },
    { accessory_type_id: 1, accessory_types: { name: 'Charger' } },
  ],
  ...over,
})

describe('clearanceLines', () => {
  it('lists each asset in tag order with its accessories, condition as a label', () => {
    const lines = clearanceLines([
      h({
        asset_tag: 'PBS-HST-001',
        category: { name: 'Headset' },
        accessories: [],
        serial_number: null,
        make: 'Jabra',
        model: null,
      }),
      h({}),
    ])
    expect(lines).toEqual([
      {
        asset_tag: 'PBS-HST-001',
        item: 'Headset',
        makeModel: 'Jabra',
        serial: '',
        condition: 'Good',
        accessories: '',
      },
      {
        asset_tag: 'PBS-LAP-001',
        item: 'Laptop',
        makeModel: 'Dell Latitude 5400',
        serial: 'SN-1',
        condition: 'Good',
        accessories: 'Charger, Mouse',
      },
    ])
  })
  it('pads with blank rows so IT can add what is missing', () => {
    expect(paddedLines(clearanceLines([h({})]))).toHaveLength(5)
    expect(paddedLines(clearanceLines([h({})]))[4]).toBeNull()
    expect(paddedLines([])).toHaveLength(5)
  })
})
