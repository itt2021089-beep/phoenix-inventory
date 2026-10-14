import type { Row, Sheets } from './parseWorkbook'

/**
 * Reads an .xlsx into plain rows, keyed by the header text. exceljs is loaded only here, so it
 * never ships in the main bundle. The file is read in the browser; nothing is uploaded.
 */
export async function readWorkbook(data: ArrayBuffer): Promise<Sheets> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(data)

  const sheets: Sheets = {}
  for (const ws of wb.worksheets) {
    // Headers can wrap ("From\n(user / location / old part)"); the first line is the name.
    const headers = (ws.getRow(1).values as unknown[]).slice(1).map((h) =>
      String(h ?? '')
        .split('\n')[0]
        .trim(),
    )

    const rows: Row[] = []
    for (let n = 2; n <= ws.rowCount; n++) {
      const values = (ws.getRow(n).values as unknown[]).slice(1)
      const row: Row = {}
      headers.forEach((h, i) => {
        if (h) row[h] = cellText(values[i])
      })
      // The register stops at the first empty Asset Tag (docs/BUILD_PLAN.md).
      if (Object.values(row).every((v) => v === '')) break
      rows.push(row)
    }
    sheets[ws.name] = rows
  }
  return sheets
}

/** A cell as text. Dates keep their day, and formulas give their value, not the formula. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(
      value.getUTCDate(),
    ).padStart(2, '0')}`
  }
  if (typeof value === 'object') {
    const v = value as { result?: unknown; text?: unknown; richText?: { text: string }[] }
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('')
    if (v.result !== undefined) return cellText(v.result)
    if (v.text !== undefined) return String(v.text)
    return ''
  }
  return String(value).trim()
}
