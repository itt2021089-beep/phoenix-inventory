import { describe, expect, it } from 'vitest'

import { buildWorkbook } from '@/lib/excel'

import {
  buildSheets,
  type ChangeLogExportRow,
  changeLogRow,
  consumablesRow,
  dashboardRows,
} from './exportWorkbook'

const change = (over: Partial<ChangeLogExportRow> = {}): ChangeLogExportRow => ({
  id: 1,
  change_no: 'CHG-0001',
  change_date: '2026-10-01',
  change_type: 'issued',
  condition: 'good',
  accessories: [],
  accessories_missing: [],
  reason: 'New joiner',
  from_text: null,
  to_text: null,
  created_at: '2026-10-01T00:00:00Z',
  from_employee: null,
  to_employee: { full_name: 'Test Person One' },
  from_location: { name: 'IT store' },
  to_location: { name: 'Desk 1' },
  handover_form: { form_no: 'HO-0001' },
  asset: { asset_tag: 'PBS-LAP-001' },
  ...over,
})

describe('the Change Log tab', () => {
  it('uses the workbook labels and DD/MM/YYYY, naming the person over the place', () => {
    expect(changeLogRow(change())).toEqual([
      'CHG-0001',
      '01/10/2026',
      'PBS-LAP-001',
      'Issued',
      'IT store',
      'Test Person One',
      'New joiner',
      'HO-0001',
    ])
  })

  it('falls back to the free text a move writes', () => {
    const row = changeLogRow(
      change({
        change_type: 'location_changed',
        to_employee: null,
        from_location: null,
        to_location: null,
        from_text: 'Travel',
        to_text: 'Common',
        handover_form: null,
      }),
    )
    expect(row[3]).toBe('Location Changed')
    expect(row.slice(4, 6)).toEqual(['Travel', 'Common'])
    expect(row[7]).toBe('')
  })
})

describe('the Consumables tab', () => {
  const mouse = {
    id: 1,
    item_code: 'CON-001',
    name: 'Optical mouse',
    reorder_level: 10,
    notes: null,
  }
  it('flags an item at or below its reorder level, as the workbook did', () => {
    expect(consumablesRow({ ...mouse, qty_on_hand: 8 })[6]).toBe('REORDER')
    expect(consumablesRow({ ...mouse, qty_on_hand: 11 })[6]).toBe('OK')
  })
  it('fills received and issued from the movements', () => {
    expect(consumablesRow({ ...mouse, qty_on_hand: 8 }, { received: 30, issued: 22 })).toEqual([
      'CON-001',
      'Optical mouse',
      30,
      22,
      8,
      10,
      'REORDER',
      '',
    ])
  })
})

describe('the Dashboard tab', () => {
  it('writes the counts as plain values, then a line per category', () => {
    const rows = dashboardRows({ active_total: 11, in_use: 9, spare_total: 2, lost_stolen: null }, [
      { category: 'Laptop', active_total: 6, in_use: 6, spare: 0, min_spares: 3, below_min: true },
    ])
    expect(rows[0]).toEqual(['Active assets', 11])
    // A count the view does not have yet is left out, not written as zero.
    expect(rows.map((r) => r[0])).not.toContain('Lost / Stolen')
    expect(rows.at(-1)).toEqual(['Laptop', '6 / 6 / 0 / 3  (below minimum)'])
  })
})

describe('the whole workbook', () => {
  it('has the same tabs as the file it replaces, with their headers', async () => {
    const buffer = await buildWorkbook(
      buildSheets({ assets: [], changes: [change()], stock: [], totals: null, categories: [] }),
    )
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Asset Register',
      'Change Log',
      'Fault Log',
      'Service Log',
      'Consumables',
      'Dashboard',
    ])
    expect(wb.getWorksheet('Asset Register')!.getCell('A1').value).toBe('Asset Tag')
    expect(wb.getWorksheet('Fault Log')!.getCell('A1').value).toBe('Fault ID')
    expect(wb.getWorksheet('Fault Log')!.rowCount).toBe(1) // headers only until Phase 2
    expect(wb.getWorksheet('Change Log')!.getCell('A2').value).toBe('CHG-0001')
    expect(wb.getWorksheet('Change Log')!.getRow(1).font?.bold).toBe(true)
  })
})
