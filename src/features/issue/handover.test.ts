import { describe, expect, it } from 'vitest'

import {
  issueItems,
  missingSummary,
  overallReturnCondition,
  type ReturnLine,
  returnItems,
  spareShortcuts,
  stockNeeded,
} from './handover'

const line = (over: Partial<ReturnLine>): ReturnLine => ({
  assetId: 'a1',
  condition: 'good',
  accessories: {},
  nextStatus: 'spare',
  faultDescription: '',
  ...over,
})

describe('issueItems', () => {
  it('maps lines to the issue_assets items, accessories de-duplicated', () => {
    expect(issueItems([{ assetId: 'a1', condition: 'good', accessoryTypeIds: [2, 1, 2] }])).toEqual(
      [{ asset_id: 'a1', condition: 'good', accessory_type_ids: [1, 2] }],
    )
  })
})

describe('returnItems', () => {
  it('splits accessories into returned and missing, and sends a fault only when written', () => {
    const [item] = returnItems([
      line({
        accessories: { 1: true, 2: false },
        nextStatus: 'faulty',
        faultDescription: ' Screen flickers ',
      }),
    ])
    expect(item).toEqual({
      asset_id: 'a1',
      condition: 'good',
      next_status: 'faulty',
      accessories_returned: [1],
      accessories_missing: [2],
      fault_description: 'Screen flickers',
    })
    expect(returnItems([line({})])[0]).not.toHaveProperty('fault_description')
  })
})

describe('overallReturnCondition', () => {
  it('is damaged if anything is damaged, else items missing, else good', () => {
    expect(overallReturnCondition([line({})])).toBe('good')
    expect(overallReturnCondition([line({ accessories: { 1: false } })])).toBe('items_missing')
    expect(
      overallReturnCondition([line({ accessories: { 1: false } }), line({ condition: 'damaged' })]),
    ).toBe('damaged')
  })
})

describe('missingSummary', () => {
  it('names what is missing and from which asset', () => {
    const lines = [line({ accessories: { 1: true, 2: false } })]
    expect(
      missingSummary(
        lines,
        () => 'PBS-LAP-001',
        (id) => (id === 2 ? 'Mouse' : 'Charger'),
      ),
    ).toBe('Missing: Mouse (PBS-LAP-001)')
    expect(
      missingSummary(
        [line({})],
        () => '',
        () => '',
      ),
    ).toBe('')
  })
})

describe('spareShortcuts', () => {
  const spare = (tag: string, categoryId: number, name: string) => ({
    id: tag,
    asset_tag: tag,
    category_id: categoryId,
    category: { name },
  })
  const spares = [
    spare('PBS-LAP-010', 1, 'Laptop'),
    spare('PBS-LAP-009', 1, 'Laptop'),
    spare('PBS-HST-002', 2, 'Headset'),
  ]

  it('offers one per category, the lowest tag first, with how many are spare', () => {
    expect(spareShortcuts(spares, []).map((s) => [s.name, s.next.asset_tag, s.count])).toEqual([
      ['Headset', 'PBS-HST-002', 1],
      ['Laptop', 'PBS-LAP-009', 2],
    ])
  })

  it('skips what is already picked, and drops a category with none left', () => {
    expect(
      spareShortcuts(spares, ['PBS-LAP-009', 'PBS-HST-002']).map((s) => [s.name, s.next.asset_tag]),
    ).toEqual([['Laptop', 'PBS-LAP-010']])
  })

  it('puts the kinds people hold first and marks the ones nobody holds', () => {
    const s = spareShortcuts(
      [...spares, spare('PBS-ACU-001', 3, 'Air Conditioner')],
      [],
      new Map([
        [1, 9],
        [2, 10],
      ]),
    )
    expect(s.map((x) => [x.name, x.rarelyIssued])).toEqual([
      ['Headset', false],
      ['Laptop', false],
      ['Air Conditioner', true],
    ])
  })
})

describe('stockNeeded', () => {
  // Accessory 2 (Mouse) is linked to stock item 7; 1 (Charger) is not linked.
  const stockItemOf = (t: number) => (t === 2 ? 7 : null)

  it('counts linked accessories that are newly handed over', () => {
    const need = stockNeeded(
      [
        { accessoryTypeIds: [1, 2], alreadyWith: [] },
        { accessoryTypeIds: [2], alreadyWith: [] },
        { accessoryTypeIds: [2], alreadyWith: [2] },
      ],
      stockItemOf,
    )
    expect([...need]).toEqual([[7, 2]])
  })
})
