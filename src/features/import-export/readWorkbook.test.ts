import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { parseWorkbook } from './parseWorkbook'
import { readWorkbook } from './readWorkbook'

/**
 * Reads tests/fixtures/sample-workbook.xlsx: a real .xlsx with the same tabs and headers as
 * Sahan's, but fake people. Rebuild it with `node scripts/make-fixture.mjs`.
 */
async function fixture() {
  const file = await readFile('tests/fixtures/sample-workbook.xlsx')
  return readWorkbook(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer,
  )
}

describe('reading a real .xlsx', () => {
  // The first test to load exceljs, which can take over 5 s on a busy machine.
  it('finds every tab and keys rows by their header', async () => {
    const sheets = await fixture()
    expect(Object.keys(sheets)).toEqual([
      'Lists',
      'Asset Register',
      'Change Log',
      'Fault Log',
      'Consumables',
    ])
    expect(sheets['Asset Register'][0]['Asset Tag']).toBe('PBS-LAP-001')
    // The wrapped header "From\n(user / location / old part)" becomes "From".
    expect(sheets['Change Log'][0]['From']).toBe('IT Store')
    expect(sheets['Asset Register'][0]['Date Assigned']).toBe('2026-10-01')
  }, 20_000)

  it('maps the whole workbook as the spec describes', async () => {
    const { payload, counts, warnings, accessoryRows } = parseWorkbook(await fixture())

    expect(counts).toMatchObject({ assets: 3, employees: 2, changes: 2 })
    expect(accessoryRows).toBe(1)

    const laptop = payload.assets.find((a) => a.asset_tag === 'PBS-LAP-001')!
    expect(laptop).toMatchObject({
      make: 'Dell',
      status: 'in_use',
      condition: 'good',
      nid: '200012345678',
      location: null,
      date_assigned: '2026-10-01',
    })
    // The mouse row and the Notes column agree on one Mouse tick.
    expect(laptop.accessories).toEqual(['Charger', 'Mouse', 'Mouse pad'])

    expect(payload.assets.find((a) => a.asset_tag === 'PBS-LAP-002')).toMatchObject({
      accessories: ['Charger'],
      accessories_note: 'Lenovo 65W',
    })
    expect(payload.assets.find((a) => a.asset_tag === 'PBS-HST-001')).toMatchObject({
      model: null,
      notes: 'model to confirm',
      status: 'spare',
      nid: null,
    })

    // Mouse and Keyboard never become categories.
    expect(payload.categories.map((c) => c.name)).toEqual(['Laptop', 'Headset'])

    // The mouse's own Change Log row is dropped; the laptops' keep their numbers.
    expect(payload.change_log.map((c) => c.change_no)).toEqual(['CHG-0001', 'CHG-0003'])
    expect(payload.change_log[0].to_nid).toBe('200012345678')

    // FLT-0001 keeps its number; the supplier named in the action becomes a vendor.
    expect(payload.faults).toHaveLength(1)
    expect(payload.faults[0]).toMatchObject({
      fault_no: 'FLT-0001',
      asset_tag: 'PBS-LAP-001',
      date_reported: '2026-10-01',
      reported_by_nid: '200012345678',
      vendor: 'Fake Vendor',
      cost: 0,
      status: 'closed',
      date_closed: '2026-10-01',
      under_warranty: false,
    })

    // The mouse stock opens at 30 in, 22 out; the formula columns are not needed.
    expect(payload.stock).toEqual([
      { name: 'Optical mouse', reorder_level: 10, qty_received: 30, qty_issued: 22 },
    ])
    expect(counts).toMatchObject({ faults: 1, stock: 1 })

    // Notes only, no warnings.
    expect(warnings.filter((w) => w.level === 'warning')).toEqual([])
  })
})
