import { describe, expect, it } from 'vitest'

import { currentValues, THRESHOLDS, validateThreshold } from './thresholds'

const t = (key: string) => THRESHOLDS.find((x) => x.key === key)!

describe('validateThreshold', () => {
  it('takes whole numbers in range', () => {
    expect(validateThreshold(t('report_rate_limit'), '50')).toBeNull()
    expect(validateThreshold(t('reminder_window_days'), ' 45 ')).toBeNull()
  })
  it('explains what is wrong', () => {
    expect(validateThreshold(t('report_rate_limit'), '')).toMatch(/whole number/)
    expect(validateThreshold(t('report_rate_limit'), '2.5')).toMatch(/whole number/)
    expect(validateThreshold(t('report_rate_limit'), '-1')).toMatch(/whole number/)
    expect(validateThreshold(t('report_rate_limit'), '0')).toBe('Enter a number from 1 to 1000.')
    expect(validateThreshold(t('reminder_window_days'), '366')).toBe(
      'Enter a number from 1 to 365.',
    )
  })
})

describe('currentValues', () => {
  it('reads stored numbers and falls back for anything missing or not a number', () => {
    const v = currentValues([
      { key: 'reminder_window_days', value: 45 },
      { key: 'report_rate_limit', value: 'three' },
    ])
    expect(v.reminder_window_days).toBe(45)
    expect(v.report_rate_limit).toBe(3)
    expect(v.report_rate_limit_total).toBe(20)
  })
})
