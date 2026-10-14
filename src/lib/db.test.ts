import { describe, expect, it } from 'vitest'

import { customFieldsOf, isUserRole } from './db'
import generatedTypes from './database.types.ts?raw'

describe('isUserRole', () => {
  it('accepts the two roles and nothing else', () => {
    expect(isUserRole('admin')).toBe(true)
    expect(isUserRole('viewer')).toBe(true)
    expect(isUserRole('Admin')).toBe(false)
    expect(isUserRole('')).toBe(false)
  })
})

describe('src/lib/database.types.ts', () => {
  // PowerShell's `>` writes UTF-16 with CRLF, which git treats as binary. `npm run gen:types`
  // runs through cmd.exe on Windows, which writes the CLI's UTF-8 untouched.
  it('is UTF-8 with LF line endings, as `npm run gen:types` writes it', () => {
    expect(generatedTypes.includes('\u0000'), 'NUL characters: the file is UTF-16').toBe(false)
    expect(generatedTypes.includes('\r\n'), 'CRLF line endings').toBe(false)
    expect(generatedTypes.startsWith('export type Json')).toBe(true)
  })
})

describe('customFieldsOf', () => {
  it('reads the Air Conditioner fields and drops anything malformed', () => {
    const fields = customFieldsOf({
      custom_fields: [
        { key: 'btu', label: 'BTU', type: 'number' },
        { key: 'inverter', label: 'Inverter', type: 'boolean', required: true },
        { key: '', label: 'No key', type: 'text' },
        { key: 'x', label: 'Bad type', type: 'colour' },
        'not an object',
      ],
    })
    expect(fields.map((f) => f.key)).toEqual(['btu', 'inverter'])
    expect(fields[1].required).toBe(true)
  })

  it('copes with a missing category or a non-array value', () => {
    expect(customFieldsOf(undefined)).toEqual([])
    expect(customFieldsOf({ custom_fields: {} })).toEqual([])
  })
})
