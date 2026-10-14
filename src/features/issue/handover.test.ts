import { describe, expect, it } from 'vitest'

import {
  issueItems,
  missingSummary,
  overallReturnCondition,
  type ReturnLine,
  returnItems,
} from './handover'

const line = (over: Partial<ReturnLine>): ReturnLine => ({
  assetId: 'a1',
  condition: 'good',
  accessories: {},
  nextStatus: 'spare',
  faultDescription: '',
  photos: [],
  ...over,
})

describe('issueItems', () => {
  it('maps lines to the issue_assets items, accessories de-duplicated', () => {
    expect(
      issueItems([{ assetId: 'a1', condition: 'good', accessoryTypeIds: [2, 1, 2], photos: [] }]),
    ).toEqual([{ asset_id: 'a1', condition: 'good', accessory_type_ids: [1, 2] }])
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
