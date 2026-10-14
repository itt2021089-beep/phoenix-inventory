import { describe, expect, it } from 'vitest'

import type { AssetListRow } from './api'
import { sparesFor } from './spares'

const a = (over: Partial<AssetListRow>) =>
  ({ id: 'x', asset_tag: 'PBS-LAP-001', status: 'spare', category_id: 1, ...over }) as AssetListRow

describe('sparesFor', () => {
  const rows = [
    a({ id: '3', asset_tag: 'PBS-LAP-003' }),
    a({ id: '1', asset_tag: 'PBS-LAP-001' }),
    a({ id: '4', asset_tag: 'PBS-LAP-004', status: 'in_use' }),
    a({ id: '5', asset_tag: 'PBS-DSK-001', category_id: 2 }),
    a({ id: '2', asset_tag: 'PBS-LAP-002' }),
  ]
  it('offers only Spare assets of the same kind, oldest tag first', () => {
    expect(sparesFor(rows, '9', 1).map((r) => r.asset_tag)).toEqual([
      'PBS-LAP-001',
      'PBS-LAP-002',
      'PBS-LAP-003',
    ])
  })
  it('never offers the faulty one itself, and nothing when there is no spare', () => {
    expect(sparesFor(rows, '1', 1).map((r) => r.id)).toEqual(['2', '3'])
    expect(sparesFor(rows, '9', 7)).toEqual([])
  })
})
