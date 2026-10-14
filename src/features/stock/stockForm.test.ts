import { describe, expect, it } from 'vitest'

import {
  emptyMovement,
  inOut,
  type MovementDraft,
  movementRow,
  needsReorder,
  signedQty,
  toMovementInsert,
  validateMovement,
} from './stockForm'

const draft = (over: Partial<MovementDraft> = {}): MovementDraft => ({
  ...emptyMovement('2026-10-14'),
  qty: '5',
  ...over,
})

describe('signedQty', () => {
  it('in is +, out is -, an adjustment goes the way it is set', () => {
    expect(signedQty(draft())).toBe(5)
    expect(signedQty(draft({ action: 'issued' }))).toBe(-5)
    expect(signedQty(draft({ action: 'written_off' }))).toBe(-5)
    expect(signedQty(draft({ action: 'adjusted', direction: 'up' }))).toBe(5)
    expect(signedQty(draft({ action: 'adjusted', direction: 'down' }))).toBe(-5)
  })
})

describe('validateMovement', () => {
  it('accepts a good receive', () => {
    expect(validateMovement(draft(), 0)).toBeNull()
  })
  it('wants a whole number above 0', () => {
    for (const qty of ['', '0', '-2', '1.5', 'x']) {
      expect(validateMovement(draft({ qty }), 10)).toMatch(/whole number/)
    }
  })
  it('never takes stock below 0, and says why', () => {
    expect(validateMovement(draft({ action: 'issued', qty: '9' }), 8)).toBe(
      'Only 8 in stock, so 9 cannot be taken out. Stock never goes below 0.',
    )
    expect(validateMovement(draft({ action: 'issued', qty: '8' }), 8)).toBeNull()
  })
  it('asks why for an adjustment or a write-off', () => {
    expect(validateMovement(draft({ action: 'written_off' }), 8)).toMatch(/why it is written off/)
    expect(validateMovement(draft({ action: 'adjusted', direction: 'up' }), 8)).toMatch(
      /why the count/,
    )
    expect(validateMovement(draft({ action: 'written_off', notes: 'Broken' }), 8)).toBeNull()
  })
  it('checks the unit cost', () => {
    expect(validateMovement(draft({ unitCost: 'abc' }), 0)).toMatch(/unit cost/)
    expect(validateMovement(draft({ unitCost: '1,250' }), 0)).toBeNull()
  })
})

describe('toMovementInsert', () => {
  it('keeps only what applies to the action', () => {
    expect(
      toMovementInsert(
        1,
        draft({ vendorId: '3', unitCost: '1,250', employeeId: 'e1', reference: ' INV-9 ' }),
      ),
    ).toEqual({
      stock_item_id: 1,
      movement_type: 'received',
      qty_change: 5,
      movement_date: '2026-10-14',
      vendor_id: 3,
      unit_cost: 1250,
      employee_id: null,
      department_id: null,
      reference: 'INV-9',
      notes: null,
    })
    expect(
      toMovementInsert(1, draft({ action: 'issued', qty: '1', employeeId: 'e1', vendorId: '3' })),
    ).toMatchObject({ qty_change: -1, employee_id: 'e1', vendor_id: null, unit_cost: null })
  })
})

describe('reorder and totals', () => {
  it('flags at or below the reorder level, as the workbook did', () => {
    expect(needsReorder({ qty_on_hand: 8, reorder_level: 10 })).toBe(true)
    expect(needsReorder({ qty_on_hand: 10, reorder_level: 10 })).toBe(true)
    expect(needsReorder({ qty_on_hand: 11, reorder_level: 10 })).toBe(false)
    expect(needsReorder({ qty_on_hand: 0, reorder_level: 0 })).toBe(false)
  })
  it('received - issued is what is on hand', () => {
    expect(
      inOut([{ qty_change: 30 }, { qty_change: -22 }, { qty_change: -1 }, { qty_change: 1 }]),
    ).toEqual({
      received: 31,
      issued: 23,
    })
  })
  it('exports a movement with labels and DD/MM/YYYY', () => {
    expect(
      movementRow({
        id: 1,
        stock_item_id: 1,
        movement_date: '2026-10-14',
        movement_type: 'issued',
        qty_change: -1,
        unit_cost: null,
        reference: 'Issued with PBS-LAP-001',
        notes: null,
        created_at: '',
        employee: { full_name: 'Test Person One' },
        department: { name: 'Travel' },
        vendor: null,
        change: { change_no: 'CHG-0008', asset: { asset_tag: 'PBS-LAP-001' } },
      }),
    ).toEqual([
      '14/10/2026',
      'Issued',
      -1,
      'Test Person One · Travel',
      'PBS-LAP-001',
      'CHG-0008',
      '',
      'Issued with PBS-LAP-001',
      '',
    ])
  })
})
