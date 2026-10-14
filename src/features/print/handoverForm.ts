import { CONDITION_LABELS, labelOf } from '@/lib/constants'

/** Printed exactly as written (docs/BUILD_PLAN.md, handover form spec, section 5). */
export const ACKNOWLEDGEMENT = [
  'I have received the items listed above in the condition stated, and I have checked that they work.',
  'I will use them for company work only, keep them secure, and not lend them to anyone.',
  'I will not install unapproved software, remove asset labels, or open or modify the hardware.',
  'I will report any fault, damage, loss or theft to IT on the same day.',
  'I will return every item and accessory when I leave the company, change role, or when IT asks for it.',
] as const

export const MIN_ROWS = 6

export type FormLine = {
  asset_tag: string
  item: string
  makeModel: string
  serial: string
  condition: string
  accessories: string
}

type ChangeRow = {
  condition: string | null
  accessories: string[]
  asset: {
    asset_tag: string
    make: string | null
    model: string | null
    serial_number: string | null
    category: { name: string } | null
  } | null
}

export function formLines(rows: ChangeRow[]): FormLine[] {
  return rows
    .map((r) => ({
      asset_tag: r.asset?.asset_tag ?? '',
      item: r.asset?.category?.name ?? '',
      makeModel: [r.asset?.make, r.asset?.model].filter(Boolean).join(' '),
      serial: r.asset?.serial_number ?? '',
      condition: labelOf(CONDITION_LABELS, r.condition),
      accessories: r.accessories.join(', '),
    }))
    .sort((a, b) => a.asset_tag.localeCompare(b.asset_tag))
}

/** The equipment table always has at least six rows, like the paper form; blanks fill the rest. */
export function padRows<T>(rows: T[], min = MIN_ROWS): (T | null)[] {
  return [...rows, ...Array<null>(Math.max(0, min - rows.length)).fill(null)]
}

export const box = (ticked: boolean) => (ticked ? '☑' : '☐')
