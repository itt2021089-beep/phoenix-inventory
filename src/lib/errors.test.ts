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

  it('says in plain words when the connection is down', () => {
    for (const m of [
      'TypeError: Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Load failed',
    ]) {
      expect(errorMessage({ message: m })).toBe(
        'Could not reach the server. Check the internet connection and try again.',
      )
    }
  })
})
