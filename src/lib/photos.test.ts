import { describe, expect, it } from 'vitest'

import { checkPhotoFile, ENTITY_FOLDERS, photoPath } from './photos'

describe('photoPath', () => {
  it('puts each entity in its own folder, per the schema', () => {
    expect(photoPath('change_log', 'CHG-0007', 'issue', 'abc')).toBe(
      'changes/CHG-0007/abc-issue.jpg',
    )
    expect(photoPath('fault', 'FLT-0001', 'damage', 'abc')).toBe('faults/FLT-0001/abc-damage.jpg')
    expect(photoPath('handover_form', 'HO-0001', 'signed_form', 'abc')).toBe(
      'handover/HO-0001/abc-signed_form.jpg',
    )
    expect(photoPath('service_job', 'SRV-0001', 'invoice', 'abc')).toBe(
      'service/SRV-0001/abc-invoice.jpg',
    )
    expect(photoPath('asset', 'a1b2', 'asset', 'abc')).toBe('assets/a1b2/abc-asset.jpg')
    expect(Object.values(ENTITY_FOLDERS)).toEqual([
      'assets',
      'changes',
      'faults',
      'handover',
      'service',
    ])
  })
  it('never reuses a name, and keeps odd characters out of the folder', () => {
    expect(photoPath('asset', 'x', 'asset')).not.toBe(photoPath('asset', 'x', 'asset'))
    expect(photoPath('fault', '../../x/y', 'damage', 'r')).toBe('faults/------x-y/r-damage.jpg')
  })
})

describe('checkPhotoFile', () => {
  it('takes pictures and refuses anything else', () => {
    expect(checkPhotoFile({ type: 'image/png', size: 10 })).toBeNull()
    expect(checkPhotoFile({ type: 'application/pdf', size: 10, name: 'a.pdf' })).toMatch(
      /not a picture/,
    )
  })
})
