import { TIME_ZONE } from './constants'

/** 'YYYY-MM-DD' (a business date from the database) -> 'DD/MM/YYYY'. No time zone involved. */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : isoDate
}

/** A timestamp -> 'DD/MM/YYYY HH:mm' in Asia/Colombo. */
export function formatDateTime(timestamp: string | null | undefined): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return timestamp
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`
}

/** Today in Asia/Colombo as 'YYYY-MM-DD', for date inputs and defaults. */
export function todayInColombo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now)
}

/** LKR 12,500 (no decimals unless there are cents: LKR 12,500.50). */
export function formatMoney(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return ''
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(n)) return ''
  const hasCents = Math.round(n * 100) % 100 !== 0
  return `LKR ${n.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}
