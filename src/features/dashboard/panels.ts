import type { Tables } from '@/lib/database.types'
import { formatDate } from '@/lib/format'

export type DueRow = Tables<'v_due_soon'>

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

/** "Warranty ends in 10 days", "Service due today", "Service overdue by 10 days". */
export function dueLabel(r: Pick<DueRow, 'kind' | 'days_left'>): string {
  const left = r.days_left ?? 0
  const what = r.kind === 'warranty' ? 'Warranty' : 'Service'
  if (r.kind === 'warranty') {
    return left === 0 ? 'Warranty ends today' : `Warranty ends in ${days(left)}`
  }
  if (left < 0) return `${what} overdue by ${days(-left)}`
  return left === 0 ? 'Service due today' : `Service due in ${days(left)}`
}

/** Overdue first (the most overdue at the top), then the soonest. */
export function sortDue<T extends Pick<DueRow, 'days_left'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0))
}

export type AttentionItem = {
  key: string
  /** 'danger' is overdue, empty or broken; 'warn' is coming up or running low. */
  tone: 'danger' | 'warn'
  text: string
  /** A page to open, or '#due-soon' for the full reminder list on this page. */
  to: string
}

export type AttentionInput = {
  totals: Pick<
    Tables<'v_dashboard'>,
    'in_use_without_holder' | 'open_faults' | 'open_qr_faults'
  > | null
  due: DueRow[]
  categories: Pick<
    Tables<'v_category_summary'>,
    'category' | 'category_id' | 'spare' | 'min_spares' | 'below_min'
  >[]
  stockToReorder: Pick<
    Tables<'v_stock_levels'>,
    'stock_item_id' | 'item_code' | 'name' | 'qty_on_hand' | 'reorder_level'
  >[]
  openFaults: Pick<Tables<'v_open_faults'>, 'status'>[]
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** "12 Laptop warranties end in 18 days" for a group; "PBS-ACU-002: Service overdue by 5 days" for one. */
function dueGroupText(rows: DueRow[]): string {
  const r = rows[0]
  if (rows.length === 1) return `${r.asset_tag}: ${dueLabel(r)}`
  const n = rows.length
  const left = r.days_left ?? 0
  const what = `${n} ${r.category ?? ''} ${r.kind === 'warranty' ? 'warranties' : 'services'}`
  if (r.kind === 'warranty') {
    return left === 0 ? `${what} end today` : `${what} end in ${days(left)}`
  }
  if (left < 0) return `${what} overdue by ${days(-left)}`
  return left === 0 ? `${what} due today` : `${what} due in ${days(left)}`
}

/**
 * Everything on the dashboard that needs Sahan to act, as one short list: red (overdue, empty,
 * broken) before amber (coming up, running low). Alike reminders are grouped, so twelve laptops
 * bought together make one line, not twelve.
 */
export function attentionItems(d: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = []
  const t = d.totals

  if ((t?.in_use_without_holder ?? 0) > 0) {
    const n = t!.in_use_without_holder!
    items.push({
      key: 'no-holder',
      tone: 'danger',
      text: `${n} In Use ${plural(n, 'asset has', 'assets have')} no person and no location: use Move to say where`,
      to: '/assets?status=in_use',
    })
  }

  const open = d.openFaults.length || (t?.open_faults ?? 0)
  if (open > 0) {
    const qr = t?.open_qr_faults ?? 0
    const vendor = d.openFaults.filter((f) => f.status === 'with_vendor').length
    const extra = [qr && `${qr} new from QR`, vendor && `${vendor} with vendor`].filter(Boolean)
    items.push({
      key: 'faults',
      tone: qr > 0 ? 'danger' : 'warn',
      text: `${open} open ${plural(open, 'fault', 'faults')}${extra.length ? ` (${extra.join(', ')})` : ''}`,
      to: '/faults',
    })
  }

  const groups = new Map<string, DueRow[]>()
  for (const r of sortDue(d.due)) {
    const k = `${r.kind}|${r.days_left}|${r.category}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  for (const [k, rows] of groups) {
    const r = rows[0]
    items.push({
      key: `due-${k}`,
      tone: r.overdue ? 'danger' : 'warn',
      text: `${dueGroupText(rows)} (${formatDate(r.due_date)})`,
      to: rows.length === 1 ? `/assets/${r.asset_tag}` : '#due-soon',
    })
  }

  for (const c of d.categories.filter((c) => c.below_min)) {
    items.push({
      key: `spares-${c.category_id}`,
      tone: (c.spare ?? 0) === 0 ? 'danger' : 'warn',
      text: `${c.category} spares: ${c.spare ?? 0} left, minimum ${c.min_spares ?? 0}`,
      to: `/assets?category=${c.category_id}&status=spare`,
    })
  }

  for (const s of d.stockToReorder) {
    items.push({
      key: `stock-${s.stock_item_id}`,
      tone: (s.qty_on_hand ?? 0) === 0 ? 'danger' : 'warn',
      text: `${s.name}: ${s.qty_on_hand ?? 0} left, reorder at ${s.reorder_level ?? 0}`,
      to: `/stock/${s.item_code}`,
    })
  }

  // Red first; otherwise keep the order above (a stable sort).
  return items.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'danger' ? -1 : 1))
}
