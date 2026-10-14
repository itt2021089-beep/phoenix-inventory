import { describe, expect, it } from 'vitest'

import { keyFromLabel, parseOptions, validateFields } from './customFieldsEditor'

describe('custom field editor helpers', () => {
  it('makes a key from the label, unique among existing keys', () => {
    expect(keyFromLabel('Gas type', [])).toBe('gas_type')
    expect(keyFromLabel('BTU (rating)', [])).toBe('btu_rating')
    expect(keyFromLabel('Gas type', ['gas_type'])).toBe('gas_type_2')
    expect(keyFromLabel('!!!', [])).toBe('field')
  })

  it('parses select options', () => {
    expect(parseOptions(' R32, R410A ,, R32')).toEqual(['R32', 'R410A'])
  })

  it('reports unusable field lists', () => {
    expect(validateFields([{ key: 'a', label: 'A', type: 'select', options: [] }])).toEqual([
      '"A" needs at least one option.',
    ])
    expect(
      validateFields([
        { key: 'a', label: 'A', type: 'text' },
        { key: 'a', label: 'B', type: 'text' },
      ]),
    ).toEqual(['Two fields share the key "a".'])
    expect(validateFields([{ key: 'a', label: 'A', type: 'number' }])).toEqual([])
  })
})
