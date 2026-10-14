import { describe, expect, it } from 'vitest'

import type { FaultRow } from './api'
import {
  EMPTY_FAULT_FILTERS,
  faultRow,
  filterFaults,
  isNewFromQr,
  repairSpend,
  suggestPeople,
} from './filters'

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

describe('isNewFromQr', () => {
  it('is a QR report that is still Open and never edited', () => {
    expect(isNewFromQr({ source: 'qr', status: 'open', updated_at: null })).toBe(true)
    expect(isNewFromQr({ source: 'qr', status: 'in_progress', updated_at: null })).toBe(false)
    expect(isNewFromQr({ source: 'qr', status: 'open', updated_at: '2026-10-16T01:00:00Z' })).toBe(
      false,
    )
    expect(isNewFromQr({ source: 'admin', status: 'open', updated_at: null })).toBe(false)
  })
  it('has its own inbox filter', () => {
    const rows = [
      fault({ id: 1, source: 'qr' }),
      fault({ id: 2, fault_no: 'FLT-0002', source: 'admin' }),
    ]
    expect(
      filterFaults(rows, { ...EMPTY_FAULT_FILTERS, status: 'new_qr' }).map((f) => f.id),
    ).toEqual([1])
  })
})

describe('suggestPeople', () => {
  const people = [
    { id: 'p1', full_name: 'Kamal Perera', status: 'active' },
    { id: 'p2', full_name: 'Kamal Silva', status: 'active' },
    { id: 'p3', full_name: 'Nimal Perera', status: 'active' },
    { id: 'p4', full_name: 'Kamal Fernando', status: 'left' },
  ]
  it('puts the exact name first', () => {
    expect(suggestPeople('kamal  perera', people).map((p) => p.id)).toEqual(['p1'])
  })
  it('finds people by the words typed, in any order', () => {
    expect(suggestPeople('Perera Nimal', people).map((p) => p.id)).toEqual(['p3'])
  })
  it('offers everyone with that first name when only a first name was typed, never someone who left', () => {
    expect(suggestPeople('kamal', people).map((p) => p.id)).toEqual(['p1', 'p2'])
  })
  it('offers nobody for a name it cannot match', () => {
    expect(suggestPeople('Sunil', people)).toEqual([])
    expect(suggestPeople('  ', people)).toEqual([])
  })
})
