/**
 * Excel export. exceljs is large, so it is imported only when someone actually exports: it
 * never ships in the main bundle (CLAUDE.md, Stack).
 */
export type Sheet = {
  name: string
  columns: readonly string[]
  rows: (string | number | null)[][]
}

/** File name in the workbook's own style: <base>_<YYYY-MM-DD>.xlsx */
export function exportFileName(base: string, isoDate: string): string {
  return `${base}_${isoDate}.xlsx`
}

export async function buildWorkbook(sheets: Sheet[]): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name, { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.addRow([...sheet.columns])
    ws.getRow(1).font = { bold: true }
    for (const row of sheet.rows) ws.addRow(row)
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } }
    // Width from the longest value in each column, within sensible bounds.
    sheet.columns.forEach((title, i) => {
      const longest = Math.max(title.length, ...sheet.rows.map((r) => String(r[i] ?? '').length))
      ws.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 8), 50)
    })
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

export async function downloadWorkbook(fileName: string, sheets: Sheet[]): Promise<void> {
  const buffer = await buildWorkbook(sheets)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
