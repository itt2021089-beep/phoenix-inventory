import { describe, expect, it } from 'vitest'

import { publicErrorMessage, reportPhotoPath, tagFromPath, validateReport } from './reportForm'

describe('tagFromPath', () => {
  it('reads the tag from /a/<tag>', () => {
    expect(tagFromPath('/a/PBS-LAP-001')).toBe('PBS-LAP-001')
    expect(tagFromPath('/a/PBS-LAP-001/')).toBe('PBS-LAP-001')
    expect(tagFromPath('/a/pbs%2Dlap%2D001')).toBe('pbs-lap-001')
  })
  it('refuses anything else', () => {
    expect(tagFromPath('/assets/PBS-LAP-001')).toBeNull()
    expect(tagFromPath('/a/')).toBeNull()
    expect(tagFromPath('/a/x/y')).toBeNull()
    expect(tagFromPath('/a/%E0%A4%A')).toBeNull()
  })
})

describe('validateReport', () => {
  it('accepts a good report', () => {
    expect(validateReport({ name: 'Kamal', description: 'Screen flickers' })).toBeNull()
  })
  it('says what is missing, in plain words', () => {
    expect(validateReport({ name: '  ', description: 'Screen flickers' })).toMatch(/your name/)
    expect(validateReport({ name: 'x'.repeat(81), description: 'Screen flickers' })).toMatch(
      /too long/,
    )
    expect(validateReport({ name: 'Kamal', description: 'bad' })).toMatch(/what is wrong/)
    expect(validateReport({ name: 'Kamal', description: 'x'.repeat(1001) })).toMatch(/too long/)
  })
})

describe('the photo path', () => {
  it('is the only shape the bucket accepts from a logged-out phone', () => {
    expect(reportPhotoPath()).toMatch(
      /^reports\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/,
    )
    expect(reportPhotoPath()).not.toBe(reportPhotoPath())
  })
})

describe('publicErrorMessage', () => {
  it('passes on the sentences the database wrote for staff', () => {
    expect(
      publicErrorMessage({
        code: 'PT429',
        message: 'Too many reports right now. Please try again later.',
      }),
    ).toMatch(/^Too many reports/)
    expect(
      publicErrorMessage({
        code: '22023',
        message: 'Please enter your name (up to 80 characters).',
      }),
    ).toMatch(/^Please enter your name/)
  })
  it('hides anything technical behind one friendly line', () => {
    for (const e of [
      { code: '42501', message: 'permission denied for table fault_log' },
      { message: 'TypeError: Failed to fetch' },
      new Error('boom'),
      null,
    ]) {
      expect(publicErrorMessage(e)).toMatch(/did not go through/)
    }
  })
})
