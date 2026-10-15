import { describe, expect, it } from 'vitest'

import { type AttentionInput, attentionItems, type DueRow, dueLabel, sortDue } from './panels'

describe('dueLabel', () => {
  it('says what is coming, in words', () => {
    expect(dueLabel({ kind: 'warranty', days_left: 10 })).toBe('Warranty ends in 10 days')
    expect(dueLabel({ kind: 'warranty', days_left: 1 })).toBe('Warranty ends in 1 day')
    expect(dueLabel({ kind: 'warranty', days_left: 0 })).toBe('Warranty ends today')
    expect(dueLabel({ kind: 'service', days_left: 5 })).toBe('Service due in 5 days')
    expect(dueLabel({ kind: 'service', days_left: 0 })).toBe('Service due today')
    expect(dueLabel({ kind: 'service', days_left: -10 })).toBe('Service overdue by 10 days')
    expect(dueLabel({ kind: 'service', days_left: -1 })).toBe('Service overdue by 1 day')
  })
})

describe('sorting', () => {
  it('puts the most overdue first, then the soonest', () => {
    expect(
      sortDue([{ days_left: 5 }, { days_left: -10 }, { days_left: 0 }]).map((r) => r.days_left),
    ).toEqual([-10, 0, 5])
  })
})

describe('attentionItems', () => {
  const due = (tag: string, kind: string, daysLeft: number, category = 'Laptop'): DueRow =>
    ({
      asset_id: tag,
      asset_tag: tag,
      category,
      kind,
      days_left: daysLeft,
      overdue: daysLeft < 0,
      due_date: '2026-11-02',
    }) as DueRow
  const empty: AttentionInput = {
    totals: null,
    due: [],
    categories: [],
    stockToReorder: [],
    openFaults: [],
  }

  it('is empty when nothing needs doing', () => {
    expect(attentionItems(empty)).toEqual([])
  })

  it('groups alike reminders into one line, and keeps a single one by its tag', () => {
    const items = attentionItems({
      ...empty,
      due: [
        due('PBS-LAP-001', 'warranty', 18),
        due('PBS-LAP-002', 'warranty', 18),
        due('PBS-LAP-003', 'warranty', 18),
        due('PBS-ACU-001', 'service', -5, 'Air Conditioner'),
      ],
    })
    expect(items.map((i) => i.text)).toEqual([
      'PBS-ACU-001: Service overdue by 5 days (02/11/2026)',
      '3 Laptop warranties end in 18 days (02/11/2026)',
    ])
    expect(items[0]).toMatchObject({ tone: 'danger', to: '/assets/PBS-ACU-001' })
    expect(items[1]).toMatchObject({ tone: 'warn', to: '#due-soon' })
  })

  it('says how many faults are open, new from QR and with a vendor, and puts red first', () => {
    const items = attentionItems({
      ...empty,
      totals: { open_faults: 3, open_qr_faults: 1, in_use_without_holder: 0 },
      openFaults: [{ status: 'open' }, { status: 'with_vendor' }, { status: 'open' }],
      stockToReorder: [
        {
          stock_item_id: 1,
          item_code: 'CON-001',
          name: 'Optical mouse',
          qty_on_hand: 6,
          reorder_level: 10,
        },
      ],
      categories: [
        { category: 'Laptop', category_id: 1, spare: 0, min_spares: 2, below_min: true },
        { category: 'Headset', category_id: 2, spare: 5, min_spares: 2, below_min: false },
      ],
    })
    expect(items.map((i) => [i.tone, i.text])).toEqual([
      ['danger', '3 open faults (1 new from QR, 1 with vendor)'],
      ['danger', 'Laptop spares: 0 left, minimum 2'],
      ['warn', 'Optical mouse: 6 left, reorder at 10'],
    ])
    expect(items[1].to).toBe('/assets?category=1&status=spare')
  })
})
