import { describe, expect, it } from 'vitest'

import type { CustomField } from '@/lib/db'

import {
  addAssetsSchema,
  customValuesToForm,
  customValuesToJson,
  duplicateSerials,
  effectiveQuantity,
  missingRequired,
  parseSerials,
  tagPreview,
  toAddAssetsArgs,
} from './assetForm'

const AC_FIELDS: CustomField[] = [
  { key: 'btu', label: 'BTU', type: 'number' },
  { key: 'inverter', label: 'Inverter', type: 'boolean', required: true },
  { key: 'gas_type', label: 'Gas type', type: 'text' },
]

const base = {
  category_id: '1',
  quantity: '1',
  serials: '',
  make: ' Dell ',
  model: 'Latitude 5400',
  condition: 'new' as const,
  specification: '',
  accessories_note: '',
  purchase_date: '',
  purchase_price: '',
  supplier_id: '',
  invoice_no: '',
  warranty_until: '',
  notes: '',
  custom_values: {},
  location_id: '',
  department_id: '',
  received_date: '2026-10-14',
  reason: '',
}

describe('serials', () => {
  it('takes one per line or comma, trimmed, blanks dropped', () => {
    expect(parseSerials(' A1 \n\nB2, C3 ,')).toEqual(['A1', 'B2', 'C3'])
  })
  it('flags the same serial typed twice, ignoring case', () => {
    expect(duplicateSerials(['ab1', 'AB1', 'c'])).toEqual(['AB1'])
  })
  it('raises the quantity to the number of serials', () => {
    expect(effectiveQuantity(1, ['a', 'b', 'c'])).toBe(3)
    expect(effectiveQuantity(5, ['a'])).toBe(5)
  })
})

describe('custom fields', () => {
  it('stores numbers as numbers and ticks as true/false, and skips blanks', () => {
    expect(customValuesToJson(AC_FIELDS, { btu: '12000', inverter: 'true', gas_type: '' })).toEqual(
      {
        btu: 12000,
        inverter: true,
      },
    )
  })
  it('round-trips through the form', () => {
    const stored = { btu: 18000, inverter: false, gas_type: 'R32' }
    const form = customValuesToForm(AC_FIELDS, stored)
    expect(form).toEqual({ btu: '18000', inverter: 'false', gas_type: 'R32' })
    expect(customValuesToJson(AC_FIELDS, form)).toEqual(stored)
  })
  it('names required fields left blank', () => {
    expect(missingRequired(AC_FIELDS, { btu: '1' })).toEqual(['Inverter'])
  })
})

describe('toAddAssetsArgs', () => {
  it('trims, turns blanks into null, and parses money with commas', () => {
    const values = addAssetsSchema.parse({
      ...base,
      purchase_price: '125,000.50',
      serials: 'X1\nX2',
    })
    const args = toAddAssetsArgs(values, [])
    expect(args.p_qty).toBe(2)
    expect(args.p_serials).toEqual(['X1', 'X2'])
    expect(args.p_fields.make).toBe('Dell')
    expect(args.p_fields.specification).toBeNull()
    expect(args.p_fields.purchase_price).toBe(125000.5)
    expect(args.p_fields).not.toHaveProperty('location_id') // location is no longer used
  })

  it('refuses a bad quantity, price or date', () => {
    expect(addAssetsSchema.safeParse({ ...base, quantity: '0' }).success).toBe(false)
    expect(addAssetsSchema.safeParse({ ...base, quantity: '201' }).success).toBe(false)
    expect(addAssetsSchema.safeParse({ ...base, purchase_price: '-5' }).success).toBe(false)
    expect(addAssetsSchema.safeParse({ ...base, purchase_price: 'abc' }).success).toBe(false)
    expect(addAssetsSchema.safeParse({ ...base, received_date: '14/10/2026' }).success).toBe(false)
    expect(addAssetsSchema.safeParse({ ...base, category_id: '' }).success).toBe(false)
  })
})

describe('tagPreview', () => {
  it('shows one tag or a range', () => {
    expect(tagPreview('LAP', 7, 1)).toBe('PBS-LAP-007')
    expect(tagPreview('HST', 6, 5)).toBe('PBS-HST-006 to PBS-HST-010')
    expect(tagPreview('LAP', 1000, 1)).toBe('PBS-LAP-1000')
  })
})
