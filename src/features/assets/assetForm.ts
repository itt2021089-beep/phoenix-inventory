import { z } from 'zod'

import type { Json } from '@/lib/database.types'
import type { CustomField } from '@/lib/db'

/**
 * The asset form keeps every input as a string (that is what <input> gives back) and converts
 * once, here, on the way to the database. Empty means "not set".
 */
const optionalDate = z.union([z.literal(''), z.iso.date('Use a valid date')])
const optionalMoney = z
  .string()
  .trim()
  .refine(
    (v) =>
      v === '' ||
      (/^\d+(\.\d{1,2})?$/.test(v.replace(/,/g, '')) && Number(v.replace(/,/g, '')) >= 0),
    {
      message: 'Enter an amount like 125000 or 125000.50',
    },
  )

export const assetDetailsSchema = z.object({
  make: z.string().trim(),
  model: z.string().trim(),
  serial_number: z.string().trim(),
  condition: z.enum(['new', 'good', 'fair', 'poor', 'damaged']),
  specification: z.string().trim(),
  accessories_note: z.string().trim(),
  purchase_date: optionalDate,
  purchase_price: optionalMoney,
  supplier_id: z.string(),
  invoice_no: z.string().trim(),
  warranty_until: optionalDate,
  notes: z.string().trim(),
  custom_values: z.record(z.string(), z.string()),
})

export const addAssetsSchema = assetDetailsSchema.omit({ serial_number: true }).extend({
  category_id: z.string().min(1, 'Pick a category'),
  quantity: z.coerce
    .number<string>()
    .int('Whole numbers only')
    .min(1, 'At least 1')
    .max(200, 'At most 200 at a time'),
  serials: z.string(),
  location_id: z.string(),
  department_id: z.string(),
  received_date: z.iso.date('Use a valid date'),
  reason: z.string().trim(),
})

export type AssetDetailsValues = z.infer<typeof assetDetailsSchema>
export type AddAssetsValues = z.input<typeof addAssetsSchema>

/** One serial per line (or comma), blanks dropped. */
export function parseSerials(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Serials typed twice in the same list (case-insensitive), so they can be flagged at once. */
export function duplicateSerials(serials: string[]): string[] {
  const seen = new Map<string, number>()
  for (const s of serials) seen.set(s.toUpperCase(), (seen.get(s.toUpperCase()) ?? 0) + 1)
  return [...seen].filter(([, n]) => n > 1).map(([s]) => s)
}

/** A list of serials longer than the quantity raises the quantity: less typing, same result. */
export function effectiveQuantity(quantity: number, serials: string[]): number {
  return Math.max(quantity || 1, serials.length)
}

/** Custom field inputs -> typed jsonb values. Blank fields are left out, not stored as ''. */
export function customValuesToJson(fields: CustomField[], values: Record<string, string>): Json {
  const out: Record<string, Json> = {}
  for (const f of fields) {
    const raw = (values[f.key] ?? '').trim()
    if (raw === '') continue
    if (f.type === 'number') {
      const n = Number(raw)
      if (Number.isFinite(n)) out[f.key] = n
    } else if (f.type === 'boolean') {
      out[f.key] = raw === 'true'
    } else {
      out[f.key] = raw
    }
  }
  return out
}

/** Stored custom values -> form strings (the reverse of customValuesToJson). */
export function customValuesToForm(fields: CustomField[], stored: Json): Record<string, string> {
  const obj = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  return Object.fromEntries(
    fields.map((f) => {
      const v = (obj as Record<string, Json>)[f.key]
      return [f.key, v === null || v === undefined ? '' : String(v)]
    }),
  )
}

/** Required custom fields left blank, by label. */
export function missingRequired(fields: CustomField[], values: Record<string, string>): string[] {
  return fields.filter((f) => f.required && !(values[f.key] ?? '').trim()).map((f) => f.label)
}

const money = (v: string) => (v.trim() === '' ? null : Number(v.replace(/,/g, '')))
const blankToNull = (v: string) => (v.trim() === '' ? null : v.trim())

/** Form values -> the add_assets call. */
export function toAddAssetsArgs(values: z.output<typeof addAssetsSchema>, fields: CustomField[]) {
  const serials = parseSerials(values.serials)
  return {
    p_category_id: Number(values.category_id),
    p_qty: effectiveQuantity(values.quantity, serials),
    p_serials: serials,
    p_fields: {
      make: blankToNull(values.make),
      model: blankToNull(values.model),
      condition: values.condition,
      specification: blankToNull(values.specification),
      accessories_note: blankToNull(values.accessories_note),
      purchase_date: blankToNull(values.purchase_date),
      purchase_price: money(values.purchase_price),
      supplier_id: values.supplier_id ? Number(values.supplier_id) : null,
      invoice_no: blankToNull(values.invoice_no),
      warranty_until: blankToNull(values.warranty_until),
      notes: blankToNull(values.notes),
      custom_values: customValuesToJson(fields, values.custom_values),
      location_id: values.location_id ? Number(values.location_id) : null,
      department_id: values.department_id ? Number(values.department_id) : null,
      received_date: values.received_date,
      reason: blankToNull(values.reason),
    } satisfies Record<string, Json>,
  }
}

/** Form values -> an update of the asset's own details (never its movement columns). */
export function toAssetUpdate(values: AssetDetailsValues, fields: CustomField[]) {
  return {
    make: blankToNull(values.make),
    model: blankToNull(values.model),
    serial_number: blankToNull(values.serial_number),
    condition: values.condition,
    specification: blankToNull(values.specification),
    accessories_note: blankToNull(values.accessories_note),
    purchase_date: blankToNull(values.purchase_date),
    purchase_price: money(values.purchase_price),
    supplier_id: values.supplier_id ? Number(values.supplier_id) : null,
    invoice_no: blankToNull(values.invoice_no),
    warranty_until: blankToNull(values.warranty_until),
    notes: blankToNull(values.notes),
    custom_values: customValuesToJson(fields, values.custom_values),
  }
}

/** Tags a bulk add will get, for the preview: PBS-LAP-007, or PBS-LAP-007 to PBS-LAP-011. */
export function tagPreview(prefix: string, nextNumber: number, quantity: number): string {
  const tag = (n: number) => `PBS-${prefix}-${String(n).padStart(3, '0')}`
  return quantity <= 1 ? tag(nextNumber) : `${tag(nextNumber)} to ${tag(nextNumber + quantity - 1)}`
}
