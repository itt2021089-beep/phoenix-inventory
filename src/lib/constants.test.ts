import { describe, expect, it } from 'vitest'

import { USER_ROLE_LABELS } from './constants'

describe('USER_ROLE_LABELS', () => {
  it('has a label for every role in the schema', () => {
    expect(Object.keys(USER_ROLE_LABELS).sort()).toEqual(['admin', 'viewer'])
  })
})
