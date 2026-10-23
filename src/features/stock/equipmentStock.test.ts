import { describe, expect, it } from 'vitest'

import type { Category } from '@/lib/db'

import {
  compareForIssue,
  EQUIPMENT_COLUMNS,
  type EquipmentRow,
  equipmentRow,
  groupByCategory,
  matchesEquipment,
} from './equipmentStock'

const row = (over: Partial<EquipmentRow> = {}): EquipmentRow => ({
  id: 'a1',
  asset_tag: 'PBS-LAP-001',
  make: 'Lenovo',
  model: 'ThinkPad E14',
  serial_number: 'PF3ABC12',
  condition: 'new',
  specification: 'i5 / 16GB / 512GB',
  purchase_date: '2026-09-01',
  purchase_price: 185000,
  invoice_no: 'INV-204',
  warranty_until: '2028-09-01',
  category_id: 1,
  category: { name: 'Laptop' },
  supplier: { name: 'Lanka PC' },
  ...over,
})

const cat = (id: number, name: string, min_spares: number): Category =>
  ({ id, name, min_spares }) as unknown as Category

describe('compareForIssue', () => {
  it('puts the oldest delivery first, undated last, then by tag', () => {
    const rows = [
      row({ asset_tag: 'PBS-LAP-003', purchase_date: null }),
      row({ asset_tag: 'PBS-LAP-002', purchase_date: '2026-10-01' }),
      row({ asset_tag: 'PBS-LAP-005', purchase_date: '2026-08-01' }),
      row({ asset_tag: 'PBS-LAP-004', purchase_date: '2026-08-01' }),
    ]
    expect(rows.sort(compareForIssue).map((r) => r.asset_tag)).toEqual([
      'PBS-LAP-004',
      'PBS-LAP-005',
      'PBS-LAP-002',
      'PBS-LAP-003',
    ])
  })
})

describe('matchesEquipment', () => {
  it('matches every word against tag, model, serial, vendor or invoice', () => {
    expect(matchesEquipment(row(), '')).toBe(true)
    expect(matchesEquipment(row(), 'thinkpad lanka')).toBe(true)
    expect(matchesEquipment(row(), 'pf3abc12')).toBe(true)
    expect(matchesEquipment(row(), 'inv-204')).toBe(true)
    expect(matchesEquipment(row(), 'thinkpad dell')).toBe(false)
  })

  it('copes with missing fields', () => {
    const bare = row({ make: null, model: null, serial_number: null, supplier: null })
    expect(matchesEquipment(bare, 'pbs-lap-001')).toBe(true)
    expect(matchesEquipment(bare, 'lenovo')).toBe(false)
  })
})

describe('groupByCategory', () => {
  const categories = [cat(1, 'Laptop', 2), cat(2, 'Headset', 0), cat(3, 'Monitor', 0)]

  it('groups, counts and flags a category below its minimum', () => {
    const groups = groupByCategory([row(), row({ id: 'a2', asset_tag: 'PBS-LAP-002' })], categories)
    expect(groups.map((g) => [g.name, g.rows.length, g.short])).toEqual([['Laptop', 2, false]])
  })

  it('keeps an empty category visible when it has a minimum', () => {
    const groups = groupByCategory([row()], categories)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ name: 'Laptop', minSpares: 2, short: true })
  })

  it('hides categories with no stock and no minimum', () => {
    const groups = groupByCategory(
      [row({ category_id: 2, category: { name: 'Headset' } })],
      categories,
    )
    expect(groups.map((g) => g.name)).toEqual(['Laptop', 'Headset'])
  })

  it('narrows to one category', () => {
    const groups = groupByCategory([row()], categories, 2)
    expect(groups).toEqual([])
  })
})

describe('equipmentRow', () => {
  it('lines up with the column headings and uses display formats', () => {
    const out = equipmentRow(row())
    expect(out).toHaveLength(EQUIPMENT_COLUMNS.length)
    expect(out[0]).toBe('PBS-LAP-001')
    expect(out[4]).toBe('PF3ABC12')
    expect(out[7]).toBe('01/09/2026')
    expect(out[8]).toBe(185000)
    expect(out[10]).toBe('New')
  })

  it('leaves unknown values blank', () => {
    const out = equipmentRow(row({ purchase_price: null, serial_number: null, supplier: null }))
    expect(out[4]).toBe('')
    expect(out[5]).toBe('')
    expect(out[8]).toBe('')
  })
})
