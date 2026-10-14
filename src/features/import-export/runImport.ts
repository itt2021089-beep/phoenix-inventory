import type { Json } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

import type { ImportPayload } from './parseWorkbook'

export type ImportCounts = {
  categories: number
  locations: number
  employees: number
  assets: number
  accessories: number
  changes: number
}

const COUNT_KEYS: (keyof ImportCounts)[] = [
  'categories',
  'locations',
  'employees',
  'assets',
  'accessories',
  'changes',
]

/** The function returns plain JSON; this checks it really is the counts before they are shown. */
export function toImportCounts(value: Json | null): ImportCounts {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, Json | undefined>
    if (COUNT_KEYS.every((k) => typeof o[k] === 'number')) return o as unknown as ImportCounts
  }
  throw new Error(
    'The import answered with something unexpected. Check the assets list before trying again.',
  )
}

/** Calls import_workbook(): admin-only, one transaction, safe to repeat (docs/SCHEMA.md). */
export async function runImport(payload: ImportPayload): Promise<ImportCounts> {
  const { data, error } = await supabase.rpc('import_workbook', {
    p_payload: payload as unknown as Json,
  })
  if (error) throw error
  return toImportCounts(data)
}
