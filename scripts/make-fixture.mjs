/**
 * Builds tests/fixtures/sample-workbook.xlsx: a tiny stand-in for Sahan's workbook, with the
 * same tabs and headers but FAKE people and NIDs. Run with `node scripts/make-fixture.mjs`.
 */
import ExcelJS from 'exceljs'

const wb = new ExcelJS.Workbook()

const lists = wb.addWorksheet('Lists')
lists.addRow(['Category', 'Tag Prefix', 'Next Free Tag', 'Status', 'Condition', 'Department'])
for (const [c, p] of [
  ['Laptop', 'LAP'],
  ['Headset', 'HST'],
  ['Mouse', 'MOU'],
  ['Keyboard', 'KBD'],
])
  lists.addRow([c, p])

const reg = wb.addWorksheet('Asset Register')
reg.addRow([
  'Asset Tag', 'Category', 'Make', 'Model', 'Serial Number', 'Status', 'Condition', 'Assigned To',
  'NID No.', 'Department', 'Location / Desk', 'Date Assigned', 'Specification', 'Notes',
  'Open Faults', 'Times Repaired',
])
const rows = [
  ['PBS-LAP-001', 'Laptop', 'Dell', 'Latitude 5400', 'SN-AAA', 'In Use', 'Good', 'test person one', 'NIC200012345678', 'Travel', 'travel section', new Date(Date.UTC(2026, 9, 1)), 'i7 / 8GB', 'Charger, mouse, mouse pad', 0, 1],
  ['PBS-MOU-001', 'Mouse', 'Dell', 'MS116T', '', 'In Use', 'Good', 'test person one', 'NIC200012345678', 'Travel', 'Travel Section', new Date(Date.UTC(2026, 9, 1)), 'optical mouse', '', 0, 0],
  ['PBS-LAP-002', 'Laptop', 'Lenovo', 'ThinkPad T470', 'PF0Y5ACQ', 'In Use', 'Good', 'Test Person Two', 'NIC901234567V', 'Sales', 'Travel Section', new Date(Date.UTC(2026, 7, 5)), 'i5 / 8GB', 'Charger: Lenovo 65W', 0, 0],
  ['PBS-HST-001', 'Headset', 'Jabra', 'TBC', '', 'Spare', 'New', '', '', '', 'IT store', '', '', '', 0, 0],
]
rows.forEach((r) => reg.addRow(r))

const log = wb.addWorksheet('Change Log')
log.addRow(['Log ID', 'Date', 'Asset Tag', 'Change Type', 'From\n(user / location / old part)', 'To\n(user / location / new part)', 'Reason / Details', 'Handover Form No'])
;[
  ['CHG-0001', new Date(Date.UTC(2026, 9, 1)), 'PBS-LAP-001', 'Issued', 'IT Store', 'Travel User 1', 'recorded during inventory setup', ''],
  ['CHG-0002', new Date(Date.UTC(2026, 9, 1)), 'PBS-MOU-001', 'Issued', 'IT Store', 'Travel User 1', 'recorded during inventory setup', ''],
  ['CHG-0003', new Date(Date.UTC(2026, 7, 5)), 'PBS-LAP-002', 'Issued', 'IT Store', 'Sales User 1', 'recorded during inventory setup', ''],
].forEach((r) => log.addRow(r))

const faults = wb.addWorksheet('Fault Log')
faults.addRow(['Fault ID', 'Asset Tag', 'Date Reported', 'Reported By', 'Fault / Issue', 'Action Taken', 'Cost (LKR)', 'Date Closed', 'Status', 'Remarks'])
faults.addRow(['FLT-0001', 'PBS-LAP-001', new Date(Date.UTC(2026, 9, 1)), 'test person one', 'nuts are on loose', 'fix by supplier (fake vendor)', 0, new Date(Date.UTC(2026, 9, 1)), 'Closed', ''])

const cons = wb.addWorksheet('Consumables')
cons.addRow(['Item Code', 'Item', 'Qty Received', 'Qty Issued', 'In Stock', 'Reorder Level', 'Reorder?', 'Notes'])
cons.addRow(['MOU-0001', 'optical mouse', 30, 22, 8, 10, 'REORDER', ''])

await wb.xlsx.writeFile(new URL('../tests/fixtures/sample-workbook.xlsx', import.meta.url).pathname)
console.log('wrote tests/fixtures/sample-workbook.xlsx')
