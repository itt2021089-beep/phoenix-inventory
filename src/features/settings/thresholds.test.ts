import { describe, expect, it } from 'vitest'

import { currentValues, THRESHOLDS, validateThreshold } from './thresholds'

const t = (key: string) => THRESHOLDS.find((x) => x.key === key)!

describe('validateThreshold', () => {
  it('takes whole numbers in range', () => {
    expect(validateThreshold(t('repair_replace_pct'), '50')).toBeNull()
    expect(validateThreshold(t('reminder_window_days'), ' 45 ')).toBeNull()
  })
  it('explains what is wrong', () => {
    expect(validateThreshold(t('repair_replace_pct'), '')).toMatch(/whole number/)
    expect(validateThreshold(t('repair_replace_pct'), '2.5')).toMatch(/whole number/)
    expect(validateThreshold(t('repair_replace_pct'), '-1')).toMatch(/whole number/)
    expect(validateThreshold(t('repair_replace_pct'), '0')).toBe('Enter a number from 1 to 1000.')
    expect(validateThreshold(t('reminder_window_days'), '366')).toBe(
      'Enter a number from 1 to 365.',
    )
  })
})

describe('currentValues', () => {
  it('reads stored numbers and falls back for anything missing or not a number', () => {
    const v = currentValues([
      { key: 'repair_replace_pct', value: 40 },
      { key: 'repeat_fault_count', value: 'three' },
    ])
    expect(v.repair_replace_pct).toBe(40)
    expect(v.repeat_fault_count).toBe(3)
    expect(v.reminder_window_days).toBe(30)
    expect(v.report_rate_limit_total).toBe(20)
  })
})
