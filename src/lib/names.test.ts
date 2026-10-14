import { describe, expect, it } from 'vitest'

import { tidyName } from './names'

describe('tidyName', () => {
  it('title-cases a name typed all lower or all upper', () => {
    expect(tidyName('  test   person one ')).toBe('Test Person One')
    expect(tidyName('TEST PERSON')).toBe('Test Person')
    expect(tidyName("o'neil-perera")).toBe("O'Neil-Perera")
  })
  it('leaves a deliberately mixed-case name alone', () => {
    expect(tidyName('Anne de Silva')).toBe('Anne de Silva')
  })
})
