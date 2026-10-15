import { describe, expect, it } from 'vitest'

import type { ServiceJobRow } from '@/features/service/api'

import { serviceByVendor, vendorCells } from './reports'

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
