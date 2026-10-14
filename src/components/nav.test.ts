import { describe, expect, it } from 'vitest'

import { isNavActive, navFor, phoneBarFor } from './nav'

const paths = (role: 'admin' | 'viewer') => navFor(role).flatMap((g) => g.items.map((i) => i.to))

describe('navFor', () => {
  it('gives the admin every page, in groups', () => {
    expect(navFor('admin').map((g) => g.title)).toEqual([null, 'Daily work', 'Records', 'Office'])
    expect(paths('admin')).toContain('/issue')
    expect(paths('admin')).toContain('/audit')
  })

  it('leaves Issue and the audit log out for a viewer, and calls Excel what it does', () => {
    expect(paths('viewer')).not.toContain('/issue')
    expect(paths('viewer')).not.toContain('/audit')
    const excel = navFor('viewer')
      .flatMap((g) => g.items)
      .find((i) => i.to === '/export')
    expect(excel?.label).toBe('Export to Excel')
  })

  it('puts Faults on the phone bar for both roles, and Issue only for the admin', () => {
    expect(phoneBarFor('admin')).toEqual(['/', '/assets', '/issue', '/faults'])
    expect(phoneBarFor('viewer')).toEqual(['/', '/assets', '/people', '/faults'])
  })
})

describe('isNavActive', () => {
  it('keeps Issue lit on Return and Transfer', () => {
    expect(isNavActive('/issue', '/return')).toBe(true)
    expect(isNavActive('/issue', '/transfer')).toBe(true)
  })

  it('lights a list for its own detail pages, and Home only on the home page', () => {
    expect(isNavActive('/assets', '/assets/PBS-LAP-001')).toBe(true)
    expect(isNavActive('/assets', '/assetsx')).toBe(false)
    expect(isNavActive('/', '/assets')).toBe(false)
    expect(isNavActive('/export', '/import')).toBe(true)
  })
})
