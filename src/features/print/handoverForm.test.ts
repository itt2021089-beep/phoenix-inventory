import { describe, expect, it } from 'vitest'

import { ACKNOWLEDGEMENT, box, formLines, padRows } from './handoverForm'

describe('handover form', () => {
  it('keeps the acknowledgement wording exactly', () => {
    expect(ACKNOWLEDGEMENT).toHaveLength(5)
    expect(ACKNOWLEDGEMENT[0]).toBe(
      'I have received the items listed above in the condition stated, and I have checked that they work.',
    )
    expect(ACKNOWLEDGEMENT[4]).toBe(
      'I will return every item and accessory when I leave the company, change role, or when IT asks for it.',
    )
  })

  it('pads the equipment table to six rows, and grows past six', () => {
    expect(padRows([1, 2])).toEqual([1, 2, null, null, null, null])
    expect(padRows([1, 2, 3, 4, 5, 6, 7])).toHaveLength(7)
  })

  it('builds lines in tag order with labels', () => {
    const lines = formLines([
      {
        condition: 'good',
        accessories: ['Charger', 'Mouse'],
        asset: {
          asset_tag: 'PBS-LAP-002',
          make: 'Dell',
          model: 'Latitude 5400',
          serial_number: 'SN1',
          category: { name: 'Laptop' },
        },
      },
      {
        condition: 'new',
        accessories: [],
        asset: {
          asset_tag: 'PBS-HST-001',
          make: 'Jabra',
          model: null,
          serial_number: null,
          category: { name: 'Headset' },
        },
      },
    ])
    expect(lines.map((l) => l.asset_tag)).toEqual(['PBS-HST-001', 'PBS-LAP-002'])
    expect(lines[1]).toMatchObject({
      item: 'Laptop',
      makeModel: 'Dell Latitude 5400',
      condition: 'Good',
      accessories: 'Charger, Mouse',
    })
  })

  it('draws tick boxes', () => {
    expect(box(true)).toBe('☑')
    expect(box(false)).toBe('☐')
  })
})
