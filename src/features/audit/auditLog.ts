import type { Json } from '@/lib/database.types'
import { formatDateTime } from '@/lib/format'

export type AuditRow = {
  id: number
  table_name: string
  record_id: string
  action: string
  old_data: Json | null
  new_data: Json | null
  user_id: string | null
  at: string
}

/** The tables that write to the audit log, with the words Sahan uses for them. */
export const AUDIT_TABLES: Record<string, string> = {
  assets: 'Assets',
  asset_accessories: 'Accessories on assets',
  employees: 'People',
  categories: 'Categories',
  accessory_types: 'Accessory types',
  vendors: 'Vendors',
  stock_items: 'Stock items',
  fault_log: 'Faults',
  service_jobs: 'Service jobs',
  service_lines: 'Service lines',
  settings: 'Settings',
  profiles: 'User accounts',
}

export const AUDIT_ACTIONS: Record<string, string> = {
  insert: 'Added',
  update: 'Changed',
  delete: 'Deleted',
}

type Obj = Record<string, Json | undefined>
const obj = (v: Json | null | undefined): Obj =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {}

/** Columns that change on every edit and say nothing the row's own change does not. */
const NOISE = new Set(['updated_at', 'created_at', 'created_by'])

export type FieldChange = { field: string; before: string; after: string }

const show = (v: Json | undefined): string =>
  v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)

/** What changed on an update, field by field. Inserts and deletes list their fields instead. */
export function fieldChanges(
  row: Pick<AuditRow, 'action' | 'old_data' | 'new_data'>,
): FieldChange[] {
  const before = obj(row.old_data)
  const after = obj(row.new_data)
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((k) => !NOISE.has(k))
    .sort()
  if (row.action === 'update') {
    return keys
      .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
      .map((k) => ({ field: k, before: show(before[k]), after: show(after[k]) }))
  }
  const source = row.action === 'delete' ? before : after
  return keys
    .filter((k) => source[k] !== null && source[k] !== undefined && source[k] !== '')
    .map((k) => ({
      field: k,
      before: row.action === 'delete' ? show(source[k]) : '',
      after: row.action === 'delete' ? '' : show(source[k]),
    }))
}

/** A name a person recognises for the row: the tag, the name, the setting, the fault number. */
export function recordLabel(
  row: Pick<AuditRow, 'table_name' | 'record_id' | 'old_data' | 'new_data'>,
): string {
  const d = { ...obj(row.old_data), ...obj(row.new_data) }
  const pick = (...keys: string[]) =>
    keys.map((k) => d[k]).find((v) => typeof v === 'string' && v) as string | undefined
  return (
    pick('asset_tag', 'fault_no', 'job_no', 'item_code', 'full_name', 'name', 'key', 'work_done') ??
    row.record_id
  )
}

/** One line for the list: "Changed Assets PBS-LAP-001: status, location_id". */
export function summary(row: AuditRow): string {
  const fields = row.action === 'update' ? fieldChanges(row).map((c) => c.field) : []
  return `${AUDIT_ACTIONS[row.action] ?? row.action} ${AUDIT_TABLES[row.table_name] ?? row.table_name} ${recordLabel(row)}${
    fields.length ? `: ${fields.join(', ')}` : ''
  }`
}

export const AUDIT_COLUMNS = [
  'When',
  'Who',
  'What',
  'Table',
  'Record',
  'Field',
  'Before',
  'After',
] as const

/** One row per changed field, so the export reads as a list of edits. */
export function auditExportRows(
  rows: AuditRow[],
  who: (id: string | null) => string,
): (string | number)[][] {
  return rows.flatMap((r) => {
    const base = [
      formatDateTime(r.at),
      who(r.user_id),
      AUDIT_ACTIONS[r.action] ?? r.action,
      AUDIT_TABLES[r.table_name] ?? r.table_name,
      recordLabel(r),
    ]
    const changes = fieldChanges(r)
    return changes.length
      ? changes.map((c) => [...base, c.field, c.before, c.after])
      : [[...base, '', '', '']]
  })
}
