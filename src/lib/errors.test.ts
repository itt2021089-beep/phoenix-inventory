import { describe, expect, it } from 'vitest'

import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('turns a known unique-constraint error into plain English', () => {
    const err = {
      message: 'duplicate key value violates unique constraint "employees_nid_key"',
      details: 'Key (nid)=(200012345678) already exists.',
    }
    expect(errorMessage(err)).toBe('Someone already has that NID.')
    // The NID in `details` never reaches the screen.
    expect(errorMessage(err)).not.toContain('200012345678')
  })

  it('shows other messages as they are, and has a fallback', () => {
    expect(errorMessage({ message: 'not allowed' })).toBe('not allowed')
    expect(errorMessage('weird')).toBe('Something went wrong. Please try again.')
  })
})
