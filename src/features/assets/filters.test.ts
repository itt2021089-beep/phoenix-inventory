import { describe, expect, it } from 'vitest'

import { buildWorkbook } from '@/lib/excel'

import type { AssetListRow } from './api'
import {
  ASSET_REGISTER_COLUMNS,
  assetRegisterRow,
  EMPTY_FILTERS,
  filterAssets,
  notesColumn,
} from './filters'

// Fake people and NIDs only.
function asset(over: Partial<AssetListRow>): AssetListRow {
  return {
    id: over.asset_tag ?? 'id',
    asset_tag: 'PBS-LAP-001',
    make: 'Dell',
    model: 'Latitude 5400',
    serial_number: 'SN-AAA',
    status: 'in_use',
    condition: 'good',
    date_assigned: '2026-10-01',
    specification: 'i7 / 8GB',
    notes: null,
    accessories_note: null,
    category_id: 1,
    department_id: 4,
    location_id: 2,
    assigned_employee_id: 'e1',
    category: { name: 'Laptop', tag_prefix: 'LAP' },
    employee: { full_name: 'Test Person One', nid: '200012345678' },
    department: { name: 'Travel' },
    location: { name: 'Travel section / Desk 1' },
    asset_accessories: [],
    ...over,
  }
}

const ROWS = [
  asset({ asset_tag: 'PBS-LAP-001' }),
  asset({
    asset_tag: 'PBS-LAP-002',
    model: 'ThinkPad T470',
    make: 'Lenovo',
    serial_number: 'PF0Y',
    status: 'spare',
    assigned_employee_id: null,
    employee: null,
    department_id: null,
    department: null,
  }),
  asset({
    asset_tag: 'PBS-HST-001',
    category_id: 4,
    category: { name: 'Headset', tag_prefix: 'HST' },
    status: 'retired',
  }),
]

const tags = (rows: AssetListRow[]) => rows.map((r) => r.asset_tag)

describe('filterAssets', () => {
  it('shows active assets by default and hides Retired / Disposed', () => {
    expect(tags(filterAssets(ROWS, EMPTY_FILTERS))).toEqual(['PBS-LAP-001', 'PBS-LAP-002'])
    expect(tags(filterAssets(ROWS, { ...EMPTY_FILTERS, status: 'all' }))).toHaveLength(3)
    expect(tags(filterAssets(ROWS, { ...EMPTY_FILTERS, status: 'retired' }))).toEqual([
      'PBS-HST-001',
    ])
  })

  it('searches every word across tag, serial, make, model, person and NID', () => {
    const q = (text: string) =>
      tags(filterAssets(ROWS, { ...EMPTY_FILTERS, q: text, status: 'all' }))
    expect(q('lenovo t470')).toEqual(['PBS-LAP-002'])
    expect(q('person one')).toEqual(['PBS-LAP-001', 'PBS-HST-001'])
    expect(q('200012345678')).toEqual(['PBS-LAP-001', 'PBS-HST-001'])
    expect(q('pf0y')).toEqual(['PBS-LAP-002'])
    expect(q('  PBS-lap-001  ')).toEqual(['PBS-LAP-001'])
    expect(q('dell nothing')).toEqual([])
  })

  it('filters by category, department (including Common) and location', () => {
    expect(tags(filterAssets(ROWS, { ...EMPTY_FILTERS, status: 'all', category: '4' }))).toEqual([
      'PBS-HST-001',
    ])
    expect(tags(filterAssets(ROWS, { ...EMPTY_FILTERS, department: 'common' }))).toEqual([
      'PBS-LAP-002',
    ])
    expect(tags(filterAssets(ROWS, { ...EMPTY_FILTERS, department: '4' }))).toEqual(['PBS-LAP-001'])
    expect(tags(filterAssets(ROWS, { ...EMPTY_FILTERS, location: '99' }))).toEqual([])
  })
})

describe('the Asset Register export', () => {
  it('uses the workbook labels, Common for no department, and DD/MM/YYYY', () => {
    const row = assetRegisterRow(ROWS[1])
    expect(row[ASSET_REGISTER_COLUMNS.indexOf('Status')]).toBe('Spare')
    expect(row[ASSET_REGISTER_COLUMNS.indexOf('Department')]).toBe('Common')
    expect(assetRegisterRow(ROWS[0])[ASSET_REGISTER_COLUMNS.indexOf('Date Assigned')]).toBe(
      '01/10/2026',
    )
  })

  it('folds accessories, the accessory note and notes into one Notes column', () => {
    const a = asset({
      accessories_note: 'Lenovo 65W',
      notes: 'Sticker on lid',
      asset_accessories: [
        { accessory_type_id: 2, accessory_types: { name: 'Mouse' } },
        { accessory_type_id: 1, accessory_types: { name: 'Charger' } },
      ],
    })
    expect(notesColumn(a)).toBe('Charger, Mouse | Lenovo 65W | Sticker on lid')
  })

  it('writes a real .xlsx with the header row first', async () => {
    const buffer = await buildWorkbook([
      { name: 'Asset Register', columns: ASSET_REGISTER_COLUMNS, rows: ROWS.map(assetRegisterRow) },
    ])
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.getWorksheet('Asset Register')!
    expect(ws.getRow(1).values).toEqual([undefined, ...ASSET_REGISTER_COLUMNS])
    expect(ws.getRow(1).font?.bold).toBe(true)
    expect(ws.getCell('A2').value).toBe('PBS-LAP-001')
    expect(ws.rowCount).toBe(4)
  })
})
