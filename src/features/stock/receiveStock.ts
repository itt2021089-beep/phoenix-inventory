/**
 * Receiving a delivery: warranty typed as months (the way the vendor says it), stored as the
 * date the assets table wants.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

/** '2026-09-01' + 24 months -> '2028-09-01'. A short month clamps: 31 Jan + 1 month = 28/29 Feb. */
export function warrantyUntil(purchaseDate: string, months: number): string {
  const m = ISO.exec(purchaseDate)
  if (!m || !Number.isInteger(months) || months <= 0) return ''
  const total = Number(m[2]) - 1 + months
  const year = Number(m[1]) + Math.floor(total / 12)
  const month1 = (total % 12) + 1
  const day = Math.min(Number(m[3]), daysInMonth(year, month1))
  return `${year}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Whole months from one date to another (the reverse of warrantyUntil), or null if unknown. */
export function monthsBetween(from: string | null, to: string | null): number | null {
  const a = from ? ISO.exec(from) : null
  const b = to ? ISO.exec(to) : null
  if (!a || !b) return null
  const months = (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2]))
  // A day earlier in the month means a month not yet complete, unless it is the clamped month end.
  const clamped = Number(b[3]) === daysInMonth(Number(b[1]), Number(b[2]))
  const adjusted = Number(b[3]) < Number(a[3]) && !clamped ? months - 1 : months
  return adjusted > 0 ? adjusted : null
}

/** How many of the units in this delivery have a serial: 'All 5 have a serial' / '3 of 5 ...'. */
export function serialSummary(serialCount: number, quantity: number): string {
  if (quantity <= 0) return ''
  if (serialCount >= quantity)
    return quantity === 1 ? 'Serial entered' : `All ${quantity} have a serial`
  return `${serialCount} of ${quantity} have a serial`
}
