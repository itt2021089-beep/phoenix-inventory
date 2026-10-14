import { describe, expect, it } from 'vitest'

import { formatDate, formatDateTime, formatMoney, todayInColombo } from './format'

describe('formatDate', () => {
  it('turns a business date into DD/MM/YYYY without shifting the day', () => {
    expect(formatDate('2026-10-01')).toBe('01/10/2026')
    expect(formatDate(null)).toBe('')
  })
})

describe('formatDateTime', () => {
  it('shows a timestamp in Colombo time (UTC+05:30)', () => {
    expect(formatDateTime('2026-10-13T20:00:00Z')).toBe('14/10/2026 01:30')
  })
})

describe('todayInColombo', () => {
  it('uses the Colombo date, which is ahead of UTC in the evening', () => {
    expect(todayInColombo(new Date('2026-10-13T20:00:00Z'))).toBe('2026-10-14')
    expect(todayInColombo(new Date('2026-10-13T10:00:00Z'))).toBe('2026-10-13')
  })
})

describe('formatMoney', () => {
  it('writes LKR with thousands separators', () => {
    expect(formatMoney(12500)).toBe('LKR 12,500')
    expect(formatMoney('12500.50')).toBe('LKR 12,500.50')
    expect(formatMoney(0)).toBe('LKR 0')
    expect(formatMoney(null)).toBe('')
  })
})
