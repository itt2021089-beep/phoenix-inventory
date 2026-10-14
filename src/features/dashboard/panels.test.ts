import { describe, expect, it } from 'vitest'

import { type CostRow, dueLabel, flagReason, sortDue, sortFlagged } from './panels'

describe('dueLabel', () => {
  it('says what is coming, in words', () => {
    expect(dueLabel({ kind: 'warranty', days_left: 10 })).toBe('Warranty ends in 10 days')
    expect(dueLabel({ kind: 'warranty', days_left: 1 })).toBe('Warranty ends in 1 day')
    expect(dueLabel({ kind: 'warranty', days_left: 0 })).toBe('Warranty ends today')
    expect(dueLabel({ kind: 'service', days_left: 5 })).toBe('Service due in 5 days')
    expect(dueLabel({ kind: 'service', days_left: 0 })).toBe('Service due today')
    expect(dueLabel({ kind: 'service', days_left: -10 })).toBe('Service overdue by 10 days')
    expect(dueLabel({ kind: 'service', days_left: -1 })).toBe('Service overdue by 1 day')
  })
})

describe('sorting', () => {
  it('puts the most overdue first, then the soonest', () => {
    expect(
      sortDue([{ days_left: 5 }, { days_left: -10 }, { days_left: 0 }]).map((r) => r.days_left),
    ).toEqual([-10, 0, 5])
  })
  it('puts the worst repair share first', () => {
    const rows = [
      { spend_pct: 55, faults_last_12m: 1 },
      { spend_pct: null, faults_last_12m: 4 },
      { spend_pct: 120, faults_last_12m: 0 },
    ]
    expect(sortFlagged(rows).map((r) => r.spend_pct)).toEqual([120, 55, null])
  })
})

describe('flagReason', () => {
  const base = {
    flag_spend: false,
    flag_faults: false,
    spend_pct: null,
    basis_source: null,
    faults_last_12m: 0,
  } as CostRow
  it('explains a spend flag, using the basis it was measured against', () => {
    expect(
      flagReason({ ...base, flag_spend: true, spend_pct: 55, basis_source: 'typical cost' }, 12),
    ).toBe('Repairs are 55% of its typical replacement cost')
    expect(
      flagReason({ ...base, flag_spend: true, spend_pct: 60, basis_source: 'purchase price' }, 12),
    ).toBe('Repairs are 60% of its purchase price')
  })
  it('explains repeat faults, and both together', () => {
    expect(flagReason({ ...base, flag_faults: true, faults_last_12m: 3 }, 12)).toBe(
      '3 faults in 12 months',
    )
    expect(
      flagReason(
        {
          ...base,
          flag_spend: true,
          flag_faults: true,
          spend_pct: 80,
          basis_source: 'typical cost',
          faults_last_12m: 4,
        },
        6,
      ),
    ).toBe('Repairs are 80% of its typical replacement cost; 4 faults in 6 months')
  })
})
