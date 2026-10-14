import { describe, expect, it } from 'vitest'

import type { FaultRow } from './api'
import { EMPTY_FAULT_FILTERS, faultRow, filterFaults, repairSpend } from './filters'

const fault = (over: Partial<FaultRow> = {}): FaultRow => ({
  id: 1,
  fault_no: 'FLT-0001',
  asset_id: 'a1',
  date_reported: '2026-10-01',
  source: 'admin',
  reported_by_name: null,
  description: 'nuts are on loose',
  status: 'open',
  action_taken: null,
  cost: 0,
  under_warranty: false,
  service_line_id: null,
  date_closed: null,
  cause: null,
  finding_notes: null,
  remarks: null,
  vendor_id: null,
  reported_by_employee_id: null,
  holder_employee_id: null,
  responsible_employee_id: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: null,
  asset: {
    asset_tag: 'PBS-LAP-001',
    status: 'faulty',
    make: 'Dell',
    model: 'Latitude',
    category: { name: 'Laptop' },
  },
  reporter: { full_name: 'Test Person One' },
  holder: null,
  responsible: null,
  vendor: null,
  service_line: null,
  ...over,
})

describe('filterFaults', () => {
  const rows = [
    fault(),
    fault({ id: 2, fault_no: 'FLT-0002', status: 'closed', date_closed: '2026-10-03' }),
    fault({
      id: 3,
      fault_no: 'FLT-0003',
      status: 'with_vendor',
      asset: {
        asset_tag: 'PBS-HST-001',
        status: 'under_repair',
        make: 'Jabra',
        model: null,
        category: { name: 'Headset' },
      },
      vendor: { name: 'Lanka PC' },
    }),
  ]

  it('shows what is not closed by default', () => {
    expect(filterFaults(rows, EMPTY_FAULT_FILTERS).map((f) => f.fault_no)).toEqual([
      'FLT-0001',
      'FLT-0003',
    ])
  })
  it('filters by status and category', () => {
    expect(filterFaults(rows, { ...EMPTY_FAULT_FILTERS, status: 'closed' })).toHaveLength(1)
    expect(filterFaults(rows, { ...EMPTY_FAULT_FILTERS, status: 'all' })).toHaveLength(3)
    expect(filterFaults(rows, { ...EMPTY_FAULT_FILTERS, status: 'with_vendor' })).toHaveLength(1)
    expect(
      filterFaults(rows, { ...EMPTY_FAULT_FILTERS, status: 'all', category: 'Headset' }),
    ).toHaveLength(1)
  })
  it('searches tag, text, reporter and vendor, every word', () => {
    const all = { ...EMPTY_FAULT_FILTERS, status: 'all' }
    expect(filterFaults(rows, { ...all, q: 'lanka' })).toHaveLength(1)
    expect(filterFaults(rows, { ...all, q: 'loose person' })).toHaveLength(3)
    expect(filterFaults(rows, { ...all, q: 'hst-001 jabra' })).toHaveLength(1)
    expect(filterFaults(rows, { ...all, q: 'nothing like this' })).toHaveLength(0)
  })
})

describe('faultRow', () => {
  it('uses the workbook labels and DD/MM/YYYY', () => {
    expect(
      faultRow(fault({ status: 'with_vendor', cause: 'wear_and_tear', under_warranty: true })),
    ).toEqual([
      'FLT-0001',
      'PBS-LAP-001',
      '01/10/2026',
      'Test Person One',
      'nuts are on loose',
      '',
      0,
      '',
      'With Vendor',
      '',
      '',
      'Yes',
      'Wear and tear',
      '',
    ])
  })
  it('falls back to the name typed on the form', () => {
    expect(faultRow(fault({ reporter: null, reported_by_name: 'Front Desk' }))[3]).toBe(
      'Front Desk',
    )
  })
})

describe('repairSpend', () => {
  it('adds fault costs and service line costs, each counted once', () => {
    expect(repairSpend([{ cost: 4500 }, { cost: 0 }], [6000, 12000])).toBe(22500)
    expect(repairSpend([], [])).toBe(0)
  })
})
