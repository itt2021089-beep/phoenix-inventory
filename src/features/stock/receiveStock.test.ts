import { describe, expect, it } from 'vitest'

import { monthsBetween, serialSummary, warrantyUntil } from './receiveStock'

describe('warrantyUntil', () => {
  it('adds whole months', () => {
    expect(warrantyUntil('2026-09-01', 24)).toBe('2028-09-01')
    expect(warrantyUntil('2026-11-15', 3)).toBe('2027-02-15')
    expect(warrantyUntil('2026-10-17', 12)).toBe('2027-10-17')
  })

  it('clamps to the end of a shorter month', () => {
    expect(warrantyUntil('2026-01-31', 1)).toBe('2026-02-28')
    expect(warrantyUntil('2027-12-31', 2)).toBe('2028-02-29')
  })

  it('gives nothing for a missing date or non-positive months', () => {
    expect(warrantyUntil('', 12)).toBe('')
    expect(warrantyUntil('2026-09-01', 0)).toBe('')
    expect(warrantyUntil('2026-09-01', -3)).toBe('')
    expect(warrantyUntil('2026-09-01', 1.5)).toBe('')
  })
})

describe('monthsBetween', () => {
  it('reverses warrantyUntil', () => {
    expect(monthsBetween('2026-09-01', '2028-09-01')).toBe(24)
    expect(monthsBetween('2026-01-31', '2026-02-28')).toBe(1)
  })

  it('counts whole months only', () => {
    expect(monthsBetween('2026-09-15', '2027-09-14')).toBe(11)
  })

  it('is null when a date is missing or the span is not positive', () => {
    expect(monthsBetween(null, '2027-01-01')).toBeNull()
    expect(monthsBetween('2027-01-01', null)).toBeNull()
    expect(monthsBetween('2027-01-01', '2026-01-01')).toBeNull()
  })
})

describe('serialSummary', () => {
  it('says how many units have a serial', () => {
    expect(serialSummary(5, 5)).toBe('All 5 have a serial')
    expect(serialSummary(3, 5)).toBe('3 of 5 have a serial')
    expect(serialSummary(0, 2)).toBe('0 of 2 have a serial')
    expect(serialSummary(1, 1)).toBe('Serial entered')
    expect(serialSummary(0, 0)).toBe('')
  })
})
