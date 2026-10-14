import type { Json } from '@/lib/database.types'

export type ServiceLineDraft = {
  /** Local key, so React can keep rows apart while they are edited. */
  key: string
  assetId: string
  workDone: string
  /** Text as typed; '' means 0. */
  cost: string
  /** '' means "fill it in from the category's interval". */
  nextDue: string
  /** An open fault this line fixes (its cost then stays on the line). */
  faultId: number | null
}

export type ServiceHeaderDraft = {
  vendorId: string
  jobType: string
  serviceDate: string
  invoiceNo: string
  invoiceTotal: string
  notes: string
}

/** '12,500' / 'LKR 12500' / '' -> a number, or NaN when it is not an amount. */
export function parseAmount(text: string): number {
  const t = text.replace(/LKR|,|\s/gi, '')
  if (t === '') return 0
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : NaN
}

export const lineTotal = (lines: ServiceLineDraft[]): number =>
  lines.reduce((sum, l) => sum + (parseAmount(l.cost) || 0), 0)

/**
 * "Warning when the line costs don't add up to the invoice total". Null when there is no
 * invoice total to compare with, or it matches.
 */
export function invoiceMismatch(lines: ServiceLineDraft[], invoiceTotal: string): number | null {
  if (invoiceTotal.trim() === '') return null
  const invoice = parseAmount(invoiceTotal)
  if (Number.isNaN(invoice)) return null
  const diff = Math.round((invoice - lineTotal(lines)) * 100) / 100
  return diff === 0 ? null : diff
}

/** Service date + interval days, as YYYY-MM-DD. Same arithmetic the database trigger does. */
export function nextDueFrom(serviceDate: string, intervalDays: number | null): string | null {
  if (!intervalDays || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return null
  const [y, m, d] = serviceDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + intervalDays)).toISOString().slice(0, 10)
}

/** What is wrong with the draft, in plain words, or null when it can be saved. */
export function validateJob(header: ServiceHeaderDraft, lines: ServiceLineDraft[]): string | null {
  if (lines.length === 0) return 'Add at least one asset to the job.'
  if (!header.serviceDate) return 'Pick the date of the job.'
  if (Number.isNaN(parseAmount(header.invoiceTotal))) return 'The invoice total is not an amount.'
  const ids = lines.map((l) => l.assetId)
  if (new Set(ids).size !== ids.length) return 'An asset is on the job twice.'
  for (const l of lines) {
    if (!l.workDone.trim()) return 'Every line needs the work done (for example "Cleaned").'
    if (Number.isNaN(parseAmount(l.cost))) return 'A line cost is not an amount.'
  }
  return null
}

/** The arguments of record_service_job (docs/SCHEMA.md). */
export function toRpcArgs(header: ServiceHeaderDraft, lines: ServiceLineDraft[]) {
  const p_header: Record<string, Json> = {
    job_type: header.jobType,
    service_date: header.serviceDate,
  }
  if (header.vendorId) p_header.vendor_id = Number(header.vendorId)
  if (header.invoiceNo.trim()) p_header.invoice_no = header.invoiceNo.trim()
  if (header.invoiceTotal.trim()) p_header.invoice_total = parseAmount(header.invoiceTotal)
  if (header.notes.trim()) p_header.notes = header.notes.trim()

  const p_lines: Json[] = lines.map((l) => {
    const line: Record<string, Json> = {
      asset_id: l.assetId,
      work_done: l.workDone.trim(),
      cost: parseAmount(l.cost) || 0,
    }
    if (l.nextDue) line.next_due_date = l.nextDue
    if (l.faultId !== null) line.fault_id = l.faultId
    return line
  })
  return { p_header: p_header as Json, p_lines: p_lines as Json }
}
