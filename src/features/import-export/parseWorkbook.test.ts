import { describe, expect, it } from 'vitest'

import {
  parseNotes,
  parseWorkbook,
  pickSpellings,
  type Sheets,
  tidyVendor,
  toAmount,
  toIsoDate,
  vendorInAction,
} from './parseWorkbook'

// Fake people, fake NIDs. Shaped exactly like the real workbook's tabs.
const LISTS = [
  { Category: 'Laptop', 'Tag Prefix': 'LAP' },
  { Category: 'Headset', 'Tag Prefix': 'HST' },
  { Category: 'Mouse', 'Tag Prefix': 'MOU' },
  { Category: 'Keyboard', 'Tag Prefix': 'KBD' },
]

const register = (over: Partial<Record<string, string>> = {}) => ({
  'Asset Tag': 'PBS-LAP-001',
  Category: 'Laptop',
  Make: 'Dell',
  Model: 'Latitude 5400',
  'Serial Number': 'SN-AAA',
  Status: 'In Use',
  Condition: 'Good',
  'Assigned To': 'test person one',
  'NID No.': 'NIC200012345678',
  Department: 'Travel',
  'Location / Desk': 'travel section',
  'Date Assigned': '2026-10-01',
  Specification: 'i7 / 8GB',
  Notes: 'Charger, mouse, mouse pad',
  ...over,
})

const sheets = (over: Partial<Sheets> = {}): Sheets => ({
  Lists: LISTS,
  'Asset Register': [register()],
  'Change Log': [],
  ...over,
})

describe('toIsoDate', () => {
  it('reads dates, serials and DD/MM/YYYY', () => {
    expect(toIsoDate('2026-10-01 00:00:00')).toBe('2026-10-01')
    expect(toIsoDate(new Date(Date.UTC(2026, 9, 1)))).toBe('2026-10-01')
    expect(toIsoDate('01/10/2026')).toBe('01/10/2026'.split('/').reverse().join('-'))
    expect(toIsoDate(46296)).toBe('2026-10-01')
    expect(toIsoDate('')).toBeNull()
    expect(toIsoDate('soon')).toBeNull()
  })
})

describe('parseNotes', () => {
  it('turns accessory words into ticks', () => {
    expect(parseNotes('Charger, mouse, mouse pad')).toEqual({
      accessories: ['Charger', 'Mouse', 'Mouse pad'],
      accessoriesNote: null,
      rest: null,
    })
  })
  it('keeps the detail after an accessory, as the spec shows', () => {
    expect(parseNotes('Charger: Lenovo 65W')).toEqual({
      accessories: ['Charger'],
      accessoriesNote: 'Lenovo 65W',
      rest: null,
    })
  })
  it('names each accessory when several have details', () => {
    expect(parseNotes('Charger: 65W, Bag: black').accessoriesNote).toBe('Charger: 65W; Bag: black')
  })
  it('keeps anything else as notes', () => {
    expect(parseNotes('Charger, sticker on lid')).toMatchObject({
      accessories: ['Charger'],
      rest: 'sticker on lid',
    })
  })
})

describe('pickSpellings', () => {
  it('keeps the commonest spelling of one place', () => {
    const picked = pickSpellings(['travel section', 'Travel section', 'Travel section'])
    expect(picked.get('travel section')).toBe('Travel section')
  })
})

describe('parseWorkbook', () => {
  it('turns a mouse row into a tick on that person’s laptop, not an asset', () => {
    const r = parseWorkbook(
      sheets({
        'Asset Register': [
          register(),
          register({
            'Asset Tag': 'PBS-MOU-001',
            Category: 'Mouse',
            Model: 'MS116T',
            'Serial Number': '',
            Notes: '',
          }),
        ],
      }),
    )
    expect(r.counts.assets).toBe(1)
    expect(r.accessoryRows).toBe(1)
    expect(r.payload.assets[0].accessories).toEqual(['Charger', 'Mouse', 'Mouse pad'])
    expect(r.warnings).toEqual([])
  })

  it('warns, and skips, a mouse whose holder has no laptop', () => {
    const r = parseWorkbook(
      sheets({
        'Asset Register': [
          register({ 'Asset Tag': 'PBS-MOU-001', Category: 'Mouse', 'Serial Number': '' }),
        ],
      }),
    )
    expect(r.counts.assets).toBe(0)
    expect(r.warnings[0].message).toMatch(/no laptop or desktop/)
  })

  it('normalises NIDs and tidies names, de-duplicating people', () => {
    const r = parseWorkbook(
      sheets({
        'Asset Register': [
          register(),
          register({
            'Asset Tag': 'PBS-HST-001',
            Category: 'Headset',
            'Serial Number': 'SN-B',
            'NID No.': 'nic 2000 1234 5678',
          }),
        ],
      }),
    )
    expect(r.counts.employees).toBe(1)
    expect(r.payload.employees[0]).toMatchObject({
      full_name: 'Test Person One',
      nid: '200012345678',
    })
  })

  it('keeps the commonest spelling of a location and uses it everywhere', () => {
    const r = parseWorkbook(
      sheets({
        'Asset Register': [
          register({ 'Location / Desk': 'travel section' }),
          register({
            'Asset Tag': 'PBS-HST-001',
            Category: 'Headset',
            'Serial Number': 'SN-B',
            'Location / Desk': 'Travel Section',
          }),
          register({
            'Asset Tag': 'PBS-HST-002',
            Category: 'Headset',
            'Serial Number': 'SN-C',
            'Location / Desk': 'Travel Section',
          }),
        ],
      }),
    )
    expect(r.payload.locations).toEqual([{ name: 'Travel Section' }])
    expect(r.payload.assets.every((a) => a.location === 'Travel Section')).toBe(true)
  })

  it('turns a TBC model into a note, and converts labels to codes', () => {
    const r = parseWorkbook(
      sheets({
        'Asset Register': [
          register({
            Model: 'TBC',
            Status: 'Spare',
            Condition: 'Fair',
            'NID No.': '',
            'Assigned To': '',
          }),
        ],
      }),
    )
    expect(r.payload.assets[0]).toMatchObject({
      model: null,
      notes: 'model to confirm',
      status: 'spare',
      condition: 'fair',
    })
  })

  it('warns about a duplicate tag, a duplicate serial, a bad NID and In Use with nobody', () => {
    const r = parseWorkbook(
      sheets({
        'Asset Register': [
          register(),
          register({ 'Serial Number': 'sn-aaa', 'Asset Tag': 'PBS-LAP-002' }),
          register({ 'Asset Tag': 'PBS-LAP-001' }),
          register({ 'Asset Tag': 'PBS-LAP-003', 'NID No.': '12345', 'Location / Desk': '' }),
        ],
      }),
    )
    const all = r.warnings.map((w) => w.message).join('\n')
    expect(all).toMatch(/PBS-LAP-001 appears more than once/)
    expect(all).toMatch(/serial number is already on PBS-LAP-001/)
    expect(all).toMatch(/not 12 digits or 9 digits/)
    expect(all).toMatch(/PBS-LAP-003: In Use but with nobody and no location/)
    // The second laptop loses only the clashing serial.
    expect(r.payload.assets.find((a) => a.asset_tag === 'PBS-LAP-002')?.serial_number).toBeNull()
  })

  it('never puts an NID in a warning', () => {
    const r = parseWorkbook(
      sheets({ 'Asset Register': [register({ 'NID No.': '123456789012345' })] }),
    )
    expect(r.warnings.length).toBeGreaterThan(0)
    for (const w of r.warnings) expect(w.message).not.toMatch(/\d{9}/)
  })

  it('resolves the Change Log "To" placeholder to the real holder, and keeps the CHG number', () => {
    const r = parseWorkbook(
      sheets({
        'Change Log': [
          {
            'Log ID': 'CHG-0001',
            Date: '2026-10-01',
            'Asset Tag': 'PBS-LAP-001',
            'Change Type': 'Issued',
            From: 'IT Store',
            To: 'Travel User 1',
            'Reason / Details': 'recorded during inventory setup',
            'Handover Form No': '',
          },
        ],
      }),
    )
    expect(r.payload.change_log[0]).toEqual({
      change_no: 'CHG-0001',
      change_date: '2026-10-01',
      asset_tag: 'PBS-LAP-001',
      change_type: 'issued',
      from_location: 'IT store',
      to_location: 'travel section',
      to_nid: '200012345678',
      from_text: null,
      to_text: null,
      reason: 'recorded during inventory setup',
    })
  })

  it('skips Change Log and Fault Log rows for things that are not assets', () => {
    const r = parseWorkbook(
      sheets({
        'Change Log': [
          {
            'Log ID': 'CHG-0002',
            'Asset Tag': 'PBS-MOU-001',
            'Change Type': 'Issued',
            Date: '',
            From: '',
            To: '',
            'Reason / Details': '',
          },
        ],
        'Fault Log': [{ 'Fault ID': 'FLT-0001', 'Asset Tag': 'PBS-MOU-001', 'Fault / Issue': 'x' }],
      }),
    )
    expect(r.payload.change_log).toHaveLength(0)
    expect(r.payload.faults).toHaveLength(0)
    expect(r.warnings.map((w) => w.message)).toContain(
      'FLT-0001: the asset PBS-MOU-001 is not in the Asset Register, so it is skipped.',
    )
  })

  it('creates a category the Lists tab forgot, and says so', () => {
    const r = parseWorkbook(
      sheets({ 'Asset Register': [register({ 'Asset Tag': 'PBS-MON-001', Category: 'Monitor' })] }),
    )
    expect(r.payload.categories.find((c) => c.name === 'Monitor')).toEqual({
      name: 'Monitor',
      tag_prefix: 'MON',
    })
    expect(r.warnings[0].message).toMatch(/not in the Lists tab, so it is created/)
  })
})

const fault = (over: Partial<Record<string, string>> = {}) => ({
  'Fault ID': 'FLT-0001',
  'Asset Tag': 'PBS-LAP-001',
  'Date Reported': '2026-10-01',
  'Reported By': 'TEST PERSON ONE',
  'Fault / Issue': 'nuts are on loose',
  'Action Taken': 'fix by supplier (lanka pc)',
  'Cost (LKR)': '0',
  'Date Closed': '2026-10-01',
  Status: 'Closed',
  Remarks: '',
  ...over,
})

describe('helpers for the Phase 2 tabs', () => {
  it('reads amounts', () => {
    expect(toAmount('LKR 12,500')).toBe(12500)
    expect(toAmount('0')).toBe(0)
    expect(toAmount('')).toBeNull()
    expect(toAmount('free')).toBeNull()
    expect(toAmount('-5')).toBeNull()
  })
  it('finds the supplier in the action text and tidies its name', () => {
    expect(vendorInAction('fix by supplier (lanka pc)')).toBe('lanka pc')
    expect(vendorInAction('tightened the screws (10 minutes)')).toBeNull()
    expect(tidyVendor('lanka pc')).toBe('Lanka PC')
    expect(tidyVendor('ABANS')).toBe('Abans')
    expect(tidyVendor('Singer Mega')).toBe('Singer Mega')
  })
})

describe('the Fault Log tab', () => {
  it('keeps FLT-0001 as the workbook has it, with the vendor and the reporter matched', () => {
    const r = parseWorkbook(sheets({ 'Fault Log': [fault()] }))
    expect(r.counts.faults).toBe(1)
    expect(r.payload.faults[0]).toEqual({
      fault_no: 'FLT-0001',
      asset_tag: 'PBS-LAP-001',
      date_reported: '2026-10-01',
      reported_by_nid: '200012345678',
      reported_by_name: null,
      description: 'nuts are on loose',
      action_taken: 'fix by supplier (lanka pc)',
      vendor: 'Lanka PC',
      cost: 0,
      status: 'closed',
      date_closed: '2026-10-01',
      under_warranty: false,
      cause: null,
      responsible_nid: null,
      remarks: null,
    })
  })

  it('keeps an unknown reporter as typed, and says so', () => {
    const r = parseWorkbook(sheets({ 'Fault Log': [fault({ 'Reported By': 'front desk' })] }))
    expect(r.payload.faults[0].reported_by_nid).toBeNull()
    expect(r.payload.faults[0].reported_by_name).toBe('Front Desk')
    expect(r.warnings.some((w) => w.level === 'info' && /kept as typed/.test(w.message))).toBe(true)
  })

  it('dates a Closed fault with no close date on the day it was reported', () => {
    const r = parseWorkbook(sheets({ 'Fault Log': [fault({ 'Date Closed': '' })] }))
    expect(r.payload.faults[0].date_closed).toBe('2026-10-01')
  })

  it('reads the extra columns our own export writes', () => {
    const r = parseWorkbook(
      sheets({
        'Fault Log': [
          fault({
            Status: 'With Vendor',
            'Date Closed': '',
            'Cost (LKR)': 'LKR 4,500',
            Vendor: 'Abans Service',
            'Under Warranty': 'Yes',
            Cause: 'Wear and tear',
            Responsible: 'test person one',
          }),
        ],
      }),
    )
    expect(r.payload.faults[0]).toMatchObject({
      status: 'with_vendor',
      date_closed: null,
      cost: 4500,
      vendor: 'Abans Service',
      under_warranty: true,
      cause: 'wear_and_tear',
      responsible_nid: '200012345678',
    })
  })

  it('skips bad rows with a reason, and never puts an NID in a warning', () => {
    const r = parseWorkbook(
      sheets({
        'Fault Log': [
          fault({ 'Fault ID': '7' }),
          fault(),
          fault(),
          fault({ 'Fault ID': 'FLT-0002', 'Fault / Issue': '' }),
          fault({ 'Fault ID': 'FLT-0003', Responsible: 'Someone Else', 'Cost (LKR)': 'n/a' }),
          { 'Fault ID': '', 'Asset Tag': '', 'Fault / Issue': '' },
        ],
      }),
    )
    expect(r.payload.faults.map((f) => f.fault_no)).toEqual(['FLT-0001', 'FLT-0003'])
    const messages = r.warnings.filter((w) => w.level === 'warning').map((w) => w.message)
    expect(messages).toEqual([
      'Fault Log row 2: the Fault ID "7" is not like FLT-0001, so the row is skipped.',
      'Fault Log row 4: FLT-0001 appears more than once; only the first is imported.',
      'FLT-0002: there is no Fault / Issue text, so it is skipped.',
      'FLT-0003: the cost "n/a" is not a number, so it is imported as 0.',
      'FLT-0003: "Responsible" names someone not in the Asset Register, so it is left blank.',
    ])
    expect(r.warnings.some((w) => w.message.includes('200012345678'))).toBe(false)
  })
})

describe('the Consumables tab', () => {
  const row = (over: Partial<Record<string, string>> = {}) => ({
    'Item Code': 'MOU-0001',
    Item: 'optical mouse',
    'Qty Received': '30',
    'Qty Issued': '22',
    'In Stock': '8',
    'Reorder Level': '10',
    'Reorder?': 'REORDER',
    Notes: '',
    ...over,
  })

  it('turns received and issued into the opening balance', () => {
    const r = parseWorkbook(sheets({ Consumables: [row(), row({ Item: '' })] }))
    expect(r.payload.stock).toEqual([
      { name: 'Optical mouse', reorder_level: 10, qty_received: 30, qty_issued: 22 },
    ])
    expect(r.counts.stock).toBe(1)
    expect(r.warnings.map((w) => w.message)).toContain(
      'Optical mouse: opening stock 8 (30 received, 22 issued).',
    )
  })

  it('refuses more out than in, since stock never goes below 0', () => {
    const r = parseWorkbook(sheets({ Consumables: [row({ 'Qty Issued': '31' })] }))
    expect(r.payload.stock).toHaveLength(0)
    expect(r.warnings[0].message).toMatch(/31 issued but only 30 received/)
  })
})
