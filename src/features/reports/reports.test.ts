import { describe, expect, it } from 'vitest'

import type { ServiceJobRow } from '@/features/service/api'

import {
  type CostRow,
  faultsByCause,
  monthLabel,
  replaceCells,
  replaceRows,
  serviceByVendor,
  spendCells,
  spendGrid,
  vendorCells,
} from './reports'

const cost = (over: Partial<CostRow>): CostRow =>
  ({
    asset_id: 'a',
    asset_tag: 'PBS-LAP-001',
    category: 'Laptop',
    make: 'Dell',
    model: 'X',
    status: 'in_use',
    repair_spend: 0,
    replacement_basis: 200000,
    basis_source: 'typical cost',
    spend_pct: 0,
    faults_last_12m: 0,
    flag_spend: false,
    flag_faults: false,
    flagged: false,
    no_basis: false,
    category_id: 1,
    ...over,
  }) as CostRow

describe('replaceRows', () => {
  it('lists flagged assets first, then the rest by repair share, and leaves out untouched and retired ones', () => {
    const rows = replaceRows([
      cost({ asset_tag: 'B', repair_spend: 10000, spend_pct: 5 }),
      cost({
        asset_tag: 'A',
        repair_spend: 120000,
        spend_pct: 60,
        flagged: true,
        flag_spend: true,
      }),
      cost({ asset_tag: 'C' }),
      cost({ asset_tag: 'D', repair_spend: 90000, spend_pct: 45, status: 'retired' }),
      cost({ asset_tag: 'E', faults_last_12m: 3, flagged: true, flag_faults: true }),
    ])
    expect(rows.map((r) => r.asset_tag)).toEqual(['A', 'E', 'B'])
  })
  it('writes the numbers and the reason for the Excel export', () => {
    expect(
      replaceCells(
        cost({
          asset_tag: 'A',
          repair_spend: 120000,
          spend_pct: 60,
          flagged: true,
          flag_spend: true,
        }),
        12,
      ),
    ).toEqual([
      'A',
      'Laptop',
      'Dell X',
      'in_use',
      120000,
      200000,
      'typical cost',
      60,
      0,
      'Repairs are 60% of its typical replacement cost',
    ])
  })
})

describe('spendGrid', () => {
  const rows = [
    { month: '2026-03-01', department: 'Travel', department_id: 1, source: 'fault', amount: 1000 },
    {
      month: '2026-03-01',
      department: 'Travel',
      department_id: 1,
      source: 'service',
      amount: 2500,
    },
    {
      month: '2026-03-01',
      department: 'Common',
      department_id: null,
      source: 'service',
      amount: 6000,
    },
    { month: '2026-02-01', department: 'HR', department_id: 2, source: 'fault', amount: 400 },
  ]
  const g = spendGrid(rows)
  it('has newest months first, departments alphabetically with Common last', () => {
    expect(g.months).toEqual(['2026-03-01', '2026-02-01'])
    expect(g.departments).toEqual(['HR', 'Travel', 'Common'])
  })
  it('adds faults and service together per cell, with totals', () => {
    expect(g.cell('2026-03-01', 'Travel')).toBe(3500)
    expect(g.monthTotal('2026-03-01')).toBe(9500)
    expect(g.departmentTotal('Common')).toBe(6000)
    expect(g.total).toBe(9900)
  })
  it('lays out the export with a total row', () => {
    expect(spendCells(g)).toEqual([
      ['Mar 2026', 0, 3500, 6000, 9500],
      ['Feb 2026', 400, 0, 0, 400],
      ['Total', 400, 3500, 6000, 9900],
    ])
    expect(monthLabel('2026-03-01')).toBe('Mar 2026')
  })
})

describe('faultsByCause', () => {
  it('counts each fault under its finding, with faults not yet investigated last', () => {
    const rows = faultsByCause([
      { cause: 'wear_and_tear', status: 'closed', cost: 4500 },
      { cause: 'wear_and_tear', status: 'open', cost: 0 },
      { cause: null, status: 'open', cost: 0 },
      { cause: 'accident', status: 'closed', cost: 1000 },
    ])
    expect(rows).toEqual([
      { cause: 'Wear and tear', faults: 2, closed: 1, cost: 4500 },
      { cause: 'Accident', faults: 1, closed: 1, cost: 1000 },
      { cause: 'Not decided', faults: 1, closed: 0, cost: 0 },
    ])
  })
})

describe('serviceByVendor', () => {
  const job = (no: string, date: string, vendor: string | null, costs: number[]) =>
    ({
      id: 1,
      job_no: no,
      job_type: 'cleaning',
      service_date: date,
      invoice_no: null,
      invoice_total: null,
      notes: null,
      vendor: vendor ? { name: vendor } : null,
      lines: costs.map((c, i) => ({
        id: i,
        asset_id: String(i),
        work_done: 'x',
        cost: c,
        next_due_date: null,
        notes: null,
        asset: null,
        faults: [],
      })),
    }) as ServiceJobRow
  const rows = serviceByVendor([
    job('SRV-0001', '2026-10-03', 'Test Vendor', [6000, 6000, 6000]),
    job('SRV-0002', '2026-11-01', 'Test Vendor', [3000]),
    job('SRV-0003', '2026-09-01', null, [500]),
  ])
  it('groups jobs by vendor with totals, biggest spend first, and no vendor as In-house', () => {
    expect(rows.map((r) => [r.vendor, r.jobs, r.lines, r.cost, r.lastDate])).toEqual([
      ['Test Vendor', 2, 4, 21000, '2026-11-01'],
      ['In-house', 1, 1, 500, '2026-09-01'],
    ])
    expect(rows[0].jobList.map((j) => j.job_no)).toEqual(['SRV-0002', 'SRV-0001'])
  })
  it('exports one row per job', () => {
    expect(vendorCells(rows)[0]).toEqual([
      'Test Vendor',
      'SRV-0002',
      '01/11/2026',
      'Cleaning',
      1,
      3000,
      '',
    ])
    expect(vendorCells(rows)).toHaveLength(3)
  })
})
