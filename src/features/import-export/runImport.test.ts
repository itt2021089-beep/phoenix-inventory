import { describe, expect, it } from 'vitest'

import { toImportCounts } from './runImport'

describe('toImportCounts', () => {
  it('accepts the counts the function returns', () => {
    const counts = {
      categories: 0,
      locations: 6,
      employees: 6,
      assets: 11,
      accessories: 13,
      changes: 11,
      faults: 1,
      stock_items: 1,
    }
    expect(toImportCounts(counts)).toEqual(counts)
  })

  it('refuses anything else rather than showing wrong numbers', () => {
    expect(() => toImportCounts(null)).toThrow(/unexpected/)
    expect(() => toImportCounts([1, 2])).toThrow(/unexpected/)
    expect(() => toImportCounts({ assets: 11 })).toThrow(/unexpected/)
    expect(() =>
      toImportCounts({
        categories: 0,
        locations: 0,
        employees: 0,
        assets: '11',
        accessories: 0,
        changes: 0,
        faults: 0,
        stock_items: 0,
      }),
    ).toThrow(/unexpected/)
  })
})
