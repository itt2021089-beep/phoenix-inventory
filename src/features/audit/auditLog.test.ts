import { describe, expect, it } from 'vitest'

import { type AuditRow, auditExportRows, fieldChanges, recordLabel, summary } from './auditLog'

const row = (over: Partial<AuditRow>): AuditRow => ({
  id: 1,
  table_name: 'assets',
  record_id: 'uuid-1',
  action: 'update',
  old_data: null,
  new_data: null,
  user_id: 'u1',
  at: '2026-10-14T05:30:00Z',
  ...over,
})

describe('fieldChanges', () => {
  it('lists only what changed on an update, without the noise columns', () => {
    const r = row({
      old_data: { asset_tag: 'PBS-LAP-001', status: 'spare', notes: null, updated_at: 'a' },
      new_data: { asset_tag: 'PBS-LAP-001', status: 'in_use', notes: 'x', updated_at: 'b' },
    })
    expect(fieldChanges(r)).toEqual([
      { field: 'notes', before: '', after: 'x' },
      { field: 'status', before: 'spare', after: 'in_use' },
    ])
  })
  it('lists the filled fields of an insert, and the old fields of a delete', () => {
    expect(
      fieldChanges(row({ action: 'insert', new_data: { name: 'HR', note: '', n: 3 } })),
    ).toEqual([
      { field: 'n', before: '', after: '3' },
      { field: 'name', before: '', after: 'HR' },
    ])
    expect(fieldChanges(row({ action: 'delete', old_data: { name: 'HR' } }))).toEqual([
      { field: 'name', before: 'HR', after: '' },
    ])
  })
})

describe('recordLabel and summary', () => {
  it('names the row by its tag, number or name when it has one', () => {
    expect(recordLabel(row({ new_data: { asset_tag: 'PBS-LAP-001' } }))).toBe('PBS-LAP-001')
    expect(
      recordLabel(row({ table_name: 'employees', old_data: { full_name: 'Test Person One' } })),
    ).toBe('Test Person One')
    expect(
      recordLabel(
        row({
          table_name: 'settings',
          record_id: 'repair_replace_pct',
          new_data: { key: 'repair_replace_pct' },
        }),
      ),
    ).toBe('repair_replace_pct')
    expect(recordLabel(row({ new_data: { x: 1 } }))).toBe('uuid-1')
  })
  it('says what happened in one line', () => {
    expect(
      summary(
        row({
          old_data: { asset_tag: 'PBS-LAP-001', status: 'spare' },
          new_data: { asset_tag: 'PBS-LAP-001', status: 'in_use' },
        }),
      ),
    ).toBe('Changed Assets PBS-LAP-001: status')
    expect(
      summary(row({ action: 'insert', table_name: 'vendors', new_data: { name: 'Lanka PC' } })),
    ).toBe('Added Vendors Lanka PC')
  })
})

describe('auditExportRows', () => {
  it('writes one row per changed field, with the person and the time', () => {
    const rows = auditExportRows(
      [
        row({
          old_data: { asset_tag: 'A', status: 'spare' },
          new_data: { asset_tag: 'A', status: 'in_use' },
        }),
      ],
      (id) => (id === 'u1' ? 'Test Admin' : ''),
    )
    expect(rows).toEqual([
      ['14/10/2026 11:00', 'Test Admin', 'Changed', 'Assets', 'A', 'status', 'spare', 'in_use'],
    ])
  })
})
