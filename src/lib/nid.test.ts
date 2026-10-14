import { describe, expect, it } from 'vitest'

import { isValidNid, nidProblem, normalizeNid } from './nid'

// Fake NIDs only.
describe('normalizeNid', () => {
  it('strips a NIC prefix and spaces, and uppercases', () => {
    expect(normalizeNid('NIC200012345678')).toBe('200012345678')
    expect(normalizeNid('nic 2000 1234 5678')).toBe('200012345678')
    expect(normalizeNid('NIC: 901234567v')).toBe('901234567V')
    expect(normalizeNid(' 901234567x ')).toBe('901234567X')
  })
})

describe('isValidNid', () => {
  it('accepts the two formats only', () => {
    expect(isValidNid('200012345678')).toBe(true)
    expect(isValidNid('901234567V')).toBe(true)
    expect(isValidNid('901234567X')).toBe(true)
    expect(isValidNid('20001234567')).toBe(false)
    expect(isValidNid('901234567')).toBe(false)
    expect(isValidNid('90123456AV')).toBe(false)
  })
})

describe('nidProblem', () => {
  it('explains what is wrong without repeating the number', () => {
    expect(nidProblem('NIC 2000 1234 5678')).toBeNull()
    expect(nidProblem('')).toBe('Enter the NID number.')
    expect(nidProblem('901234567')).toBe('Old-format NIDs end in V or X (9 digits + V).')
    const msg = nidProblem('12345')!
    expect(msg).not.toContain('12345')
  })
})
