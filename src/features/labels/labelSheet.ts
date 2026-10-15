/** A4 portrait, in millimetres. */
export const A4_WIDTH_MM = 210
export const A4_HEIGHT_MM = 297

export type LabelSettings = {
  widthMm: number
  heightMm: number
  /** Blank border round the sheet, for the printer's unprintable edge. */
  marginMm: number
  /** The first free label on the first sheet, counting left to right then down, from 1. */
  startAt: number
}

/** The spec's default: 50 x 25 mm labels (docs/BUILD_PLAN.md, Spec: QR labels). */
export const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  widthMm: 50,
  heightMm: 25,
  marginMm: 5,
  startAt: 1,
}

export type SheetGrid = { cols: number; rows: number; perPage: number }

/** How many labels fit on an A4 sheet. */
export function sheetGrid(s: LabelSettings): SheetGrid {
  const cols = Math.floor((A4_WIDTH_MM - 2 * s.marginMm) / s.widthMm)
  const rows = Math.floor((A4_HEIGHT_MM - 2 * s.marginMm) / s.heightMm)
  return {
    cols: Math.max(cols, 0),
    rows: Math.max(rows, 0),
    perPage: Math.max(cols, 0) * Math.max(rows, 0),
  }
}

/**
 * Lays tags onto sheets. The first sheet skips (startAt - 1) labels, so a half-used sticker
 * sheet can go through the printer again. A skipped slot is null.
 */
export function paginate<T>(items: T[], s: LabelSettings): (T | null)[][] {
  const { perPage } = sheetGrid(s)
  if (perPage < 1) return []
  const slots: (T | null)[] = [...Array<null>(Math.max(s.startAt - 1, 0)).fill(null), ...items]
  const pages: (T | null)[][] = []
  for (let i = 0; i < slots.length; i += perPage) pages.push(slots.slice(i, i + perPage))
  return pages
}

/**
 * The address a label's QR code holds. The tag only: never an NID or a name (CLAUDE.md).
 * `base` is VITE_PUBLIC_APP_URL, the deployed address; without it the current site is used.
 */
export function qrUrl(tag: string, base: string | undefined, fallbackOrigin: string): string {
  const root = (base?.trim() || fallbackOrigin).replace(/\/+$/, '')
  return `${root}/a/${encodeURIComponent(tag)}`
}
