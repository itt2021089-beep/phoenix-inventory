import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LABEL_SETTINGS as D,
  paginate,
  qrUrl,
  sheetGrid,
  validateSettings,
} from './labelSheet'

describe('sheetGrid', () => {
  it('fits 50 x 25 mm labels on A4 with a 5 mm margin: 4 across, 11 down', () => {
    expect(sheetGrid(D)).toEqual({ cols: 4, rows: 11, perPage: 44 })
  })
  it('follows the label size and the margin', () => {
    expect(sheetGrid({ ...D, widthMm: 70, heightMm: 37, marginMm: 0 })).toEqual({
      cols: 3,
      rows: 8,
      perPage: 24,
    })
  })
})

describe('validateSettings', () => {
  it('accepts the defaults', () => {
    expect(validateSettings(D)).toBeNull()
  })
  it('explains what does not work', () => {
    expect(validateSettings({ ...D, widthMm: 5 })).toMatch(/width/)
    expect(validateSettings({ ...D, heightMm: Number.NaN })).toMatch(/height/)
    expect(validateSettings({ ...D, marginMm: 99 })).toMatch(/margin/)
    expect(validateSettings({ ...D, widthMm: 200, marginMm: 20 })).toMatch(/does not fit/)
    expect(validateSettings({ ...D, startAt: 45 })).toMatch(/1 to 44/)
    expect(validateSettings({ ...D, startAt: 0 })).toMatch(/1 to 44/)
    expect(validateSettings({ ...D, startAt: 1.5 })).toMatch(/1 to 44/)
  })
})

describe('paginate', () => {
  const tags = Array.from({ length: 50 }, (_, i) => `T${i + 1}`)
  it('fills sheets in order', () => {
    const pages = paginate(tags, D)
    expect(pages.map((p) => p.length)).toEqual([44, 6])
    expect(pages[0][0]).toBe('T1')
    expect(pages[1][0]).toBe('T45')
  })
  it('skips used labels on the first sheet so a half-used sheet can be reused', () => {
    const pages = paginate(['A', 'B', 'C'], { ...D, startAt: 43 })
    expect(pages).toEqual([[...Array(42).fill(null), 'A', 'B'], ['C']])
  })
  it('makes no sheets for no labels', () => {
    expect(paginate([], D)).toEqual([])
  })
})

describe('qrUrl', () => {
  it('is the app address and the tag, nothing else', () => {
    expect(
      qrUrl('PBS-LAP-001', 'https://phoenix.example.pages.dev/', 'http://localhost:5173'),
    ).toBe('https://phoenix.example.pages.dev/a/PBS-LAP-001')
  })
  it('falls back to where the app is open now', () => {
    expect(qrUrl('PBS-LAP-001', undefined, 'http://localhost:5173')).toBe(
      'http://localhost:5173/a/PBS-LAP-001',
    )
    expect(qrUrl('PBS-LAP-001', '  ', 'http://localhost:5173')).toBe(
      'http://localhost:5173/a/PBS-LAP-001',
    )
  })
})
