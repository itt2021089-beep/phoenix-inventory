/** The numbers that drive reminders, repair-vs-replace and the public report limits. */
export type ThresholdKey =
  | 'repair_replace_pct'
  | 'repeat_fault_count'
  | 'repeat_fault_months'
  | 'reminder_window_days'
  | 'report_rate_limit'
  | 'report_rate_limit_total'

export type Threshold = {
  key: ThresholdKey
  label: string
  hint: string
  fallback: number
  /** Same ranges as the database's settings_validate trigger. */
  max: number
  suffix?: string
}

export const THRESHOLDS: Threshold[] = [
  {
    key: 'repair_replace_pct',
    label: 'Flag when repair spend reaches',
    hint: 'Of what it would cost to replace (its purchase price, else the category’s typical cost).',
    fallback: 50,
    max: 1000,
    suffix: '%',
  },
  {
    key: 'repeat_fault_count',
    label: 'Flag after this many faults',
    hint: 'An asset with this many faults within the period below is flagged, whatever they cost.',
    fallback: 3,
    max: 100,
  },
  {
    key: 'repeat_fault_months',
    label: 'Period for repeat faults',
    hint: 'How far back faults are counted.',
    fallback: 12,
    max: 120,
    suffix: 'months',
  },
  {
    key: 'reminder_window_days',
    label: 'Remind me this far ahead',
    hint: 'Warranties ending and services due within this many days show on the dashboard.',
    fallback: 30,
    max: 365,
    suffix: 'days',
  },
  {
    key: 'report_rate_limit',
    label: 'QR reports per item, per hour',
    hint: 'Staff scanning a label can report one item this many times an hour.',
    fallback: 3,
    max: 1000,
  },
  {
    key: 'report_rate_limit_total',
    label: 'QR reports in all, per hour',
    hint: 'Across every item.',
    fallback: 20,
    max: 10000,
  },
]

/** What is wrong with a typed value, in plain words, or null when it can be saved. */
export function validateThreshold(t: Threshold, text: string): string | null {
  if (!/^\d+$/.test(text.trim())) return 'Enter a whole number.'
  const n = Number(text)
  if (n < 1 || n > t.max) return `Enter a number from 1 to ${t.max}.`
  return null
}

/** The stored settings as numbers, with a default for anything missing or not a number. */
export function currentValues(
  rows: { key: string; value: unknown }[],
): Record<ThresholdKey, number> {
  return Object.fromEntries(
    THRESHOLDS.map((t) => {
      const v = rows.find((r) => r.key === t.key)?.value
      return [t.key, typeof v === 'number' ? v : t.fallback]
    }),
  ) as Record<ThresholdKey, number>
}
