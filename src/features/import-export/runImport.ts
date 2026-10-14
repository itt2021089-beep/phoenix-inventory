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
 * The client, with import_workbook added.
 *
 * src/lib/database.types.ts is generated from the linked project, so it only learns about this
 * function after `npx supabase db push` and `npm run gen:types`. Casting the whole client, not
 * the rpc method, matters: pulling `rpc` out on its own loses its `this` and the call fails at
 * runtime with "Cannot read properties of undefined". Keeping the cast in one named place
 * leaves the rest of the app fully typed; it can go once the types are regenerated.
 */
type ClientWithImport = {
  rpc: (
    name: 'import_workbook',
    args: { p_payload: Json },
  ) => PromiseLike<{ data: ImportCounts | null; error: { message: string } | null }>
}

export async function runImport(payload: ImportPayload): Promise<ImportCounts> {
  const client = supabase as unknown as ClientWithImport
  const { data, error } = await client.rpc('import_workbook', {
    p_payload: payload as unknown as Json,
  })
  if (error) throw error
  if (!data) throw new Error('The import returned nothing.')
  return data
}
