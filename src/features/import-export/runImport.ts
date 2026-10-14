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

/**
 * Calls import_workbook().
 *
 * The cast is here because src/lib/database.types.ts is generated from the linked project, and
 * it only learns about this function after `npx supabase db push` and `npm run gen:types`.
 * Keeping the cast in one named place means the rest of the app stays fully typed, and this
 * line can simply be deleted once the types are regenerated. Its shape is pinned by
 * supabase/tests/import.sql, which calls the real function.
 */
type ImportRpc = (
  name: 'import_workbook',
  args: { p_payload: Json },
) => PromiseLike<{
  data: ImportCounts | null
  error: { message: string } | null
}>

export async function runImport(payload: ImportPayload): Promise<ImportCounts> {
  const rpc = supabase.rpc as unknown as ImportRpc
  const { data, error } = await rpc('import_workbook', { p_payload: payload as unknown as Json })
  if (error) throw error
  if (!data) throw new Error('The import returned nothing.')
  return data
}
