import { describe, expect, it } from 'vitest'

import {
  invoiceMismatch,
  lineTotal,
  nextDueFrom,
  parseAmount,
  type ServiceHeaderDraft,
  type ServiceLineDraft,
  toRpcArgs,
  validateJob,
} from './serviceForm'

const line = (over: Partial<ServiceLineDraft> = {}): ServiceLineDraft => ({
  key: 'k1',
  assetId: 'a1',
  workDone: 'Cleaned',
  cost: '6000',
  nextDue: '',
  faultId: null,
  ...over,
})
const header = (over: Partial<ServiceHeaderDraft> = {}): ServiceHeaderDraft => ({
  vendorId: '3',
  jobType: 'cleaning',
  serviceDate: '2026-10-03',
  invoiceNo: '',
  invoiceTotal: '',
  notes: '',
  ...over,
})

describe('amounts', () => {
  it('reads what is typed', () => {
    expect(parseAmount('12,500')).toBe(12500)
    expect(parseAmount('LKR 6000')).toBe(6000)
    expect(parseAmount('')).toBe(0)
    expect(parseAmount('abc')).toBeNaN()
    expect(parseAmount('-1')).toBeNaN()
  })
  it('adds the lines', () => {
    expect(
      lineTotal([line(), line({ key: 'k2', cost: '12,000' }), line({ key: 'k3', cost: '' })]),
    ).toBe(18000)
  })
})

describe('invoiceMismatch', () => {
  const lines = [line(), line({ key: 'k2', assetId: 'a2', cost: '12000' })]
  it('is quiet when there is no invoice total, or it matches', () => {
    expect(invoiceMismatch(lines, '')).toBeNull()
    expect(invoiceMismatch(lines, '18,000')).toBeNull()
  })
  it('says how far out it is', () => {
    expect(invoiceMismatch(lines, '20000')).toBe(2000)
    expect(invoiceMismatch(lines, '17500')).toBe(-500)
  })
})

describe('nextDueFrom', () => {
  it('adds the interval across month ends', () => {
    expect(nextDueFrom('2026-10-03', 90)).toBe('2027-01-01')
    expect(nextDueFrom('2026-10-03', null)).toBeNull()
    expect(nextDueFrom('', 90)).toBeNull()
  })
})

describe('validateJob', () => {
  it('accepts a good job', () => {
    expect(validateJob(header(), [line()])).toBeNull()
  })
  it('explains what is missing', () => {
    expect(validateJob(header(), [])).toMatch(/at least one asset/)
    expect(validateJob(header({ serviceDate: '' }), [line()])).toMatch(/date/)
    expect(validateJob(header(), [line({ workDone: ' ' })])).toMatch(/work done/)
    expect(validateJob(header(), [line({ cost: 'x' })])).toMatch(/cost/)
    expect(validateJob(header({ invoiceTotal: 'x' }), [line()])).toMatch(/invoice total/)
    expect(validateJob(header(), [line(), line({ key: 'k2' })])).toMatch(/twice/)
  })
})

describe('toRpcArgs', () => {
  it('leaves out what was not filled in, so the database defaults apply', () => {
    expect(toRpcArgs(header({ vendorId: '' }), [line()])).toEqual({
      p_header: { job_type: 'cleaning', service_date: '2026-10-03' },
      p_lines: [{ asset_id: 'a1', work_done: 'Cleaned', cost: 6000 }],
    })
  })
  it('sends the invoice, a chosen due date and the fault it fixes', () => {
    const args = toRpcArgs(header({ invoiceNo: ' INV-1 ', invoiceTotal: '18,000' }), [
      line({ nextDue: '2027-01-01', faultId: 7 }),
    ])
    expect(args.p_header).toMatchObject({ vendor_id: 3, invoice_no: 'INV-1', invoice_total: 18000 })
    expect(args.p_lines).toEqual([
      {
        asset_id: 'a1',
        work_done: 'Cleaned',
        cost: 6000,
        next_due_date: '2027-01-01',
        fault_id: 7,
      },
    ])
  })
})
