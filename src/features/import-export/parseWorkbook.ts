/**
 * Reads Sahan's Excel workbook into the shape import_workbook() expects
 * (the mapping table in docs/BUILD_PLAN.md).
 *
 * Everything here is a pure function over plain rows, so the rules can be tested without a
 * spreadsheet. The file itself is read in the browser; nothing is uploaded anywhere.
 *
 * Privacy: a warning never contains an NID. It points at a row number instead.
 */
import {
  ASSET_STATUS_LABELS,
  CHANGE_TYPE_LABELS,
  CONDITION_LABELS,
  FAULT_CAUSE_LABELS,
  FAULT_STATUS_LABELS,
} from '@/lib/constants'
import type { AssetStatus, Condition, FaultCause, FaultStatus } from '@/lib/db'
import { tidyName } from '@/lib/names'
import { isValidNid, normalizeNid } from '@/lib/nid'

export type Row = Record<string, string>
export type Sheets = Record<string, Row[]>

export type Warning = { level: 'warning' | 'info'; message: string }

export type ImportPayload = {
  categories: { name: string; tag_prefix: string }[]
  locations: { name: string }[]
  employees: {
    full_name: string
    nid: string
    department: string | null
    location: string | null
  }[]
  assets: {
    asset_tag: string
    category: string
    make: string | null
    model: string | null
    serial_number: string | null
    status: AssetStatus
    condition: Condition
    nid: string | null
    department: string | null
    location: string | null
    date_assigned: string | null
    specification: string | null
    accessories_note: string | null
    notes: string | null
    accessories: string[]
  }[]
  change_log: {
    change_no: string
    change_date: string | null
    asset_tag: string
    change_type: string
    from_location: string | null
    to_location: string | null
    to_nid: string | null
    from_text: string | null
    to_text: string | null
    reason: string | null
  }[]
  faults: {
    fault_no: string
    asset_tag: string
    date_reported: string | null
    /** Set when "Reported By" matches someone in the register; otherwise the name is kept. */
    reported_by_nid: string | null
    reported_by_name: string | null
    description: string
    action_taken: string | null
    vendor: string | null
    cost: number
    status: FaultStatus
    date_closed: string | null
    under_warranty: boolean
    cause: FaultCause | null
    responsible_nid: string | null
    remarks: string | null
  }[]
  /** Consumables: each becomes a stock item with two opening movements. */
  stock: {
    name: string
    reorder_level: number | null
    qty_received: number
    qty_issued: number
  }[]
}

export type ParseResult = {
  payload: ImportPayload
  warnings: Warning[]
  counts: {
    categories: number
    locations: number
    employees: number
    assets: number
    changes: number
    faults: number
    stock: number
  }
  /** Rows that became accessory ticks rather than assets. */
  accessoryRows: number
}

/** Categories that are accessories here, never assets (CLAUDE.md, domain rule 1). */
const ACCESSORY_CATEGORIES = ['mouse', 'keyboard']
/** Accessory names the Notes column may mention. Matched case-insensitively. */
const NOTE_ACCESSORIES = ['Charger', 'Mouse pad', 'Mouse', 'Bag', 'Keyboard']
/** Categories that can carry accessories. */
const HOST_CATEGORIES = ['laptop', 'desktop']

const clean = (v: string | undefined | null) => (v ?? '').toString().trim()
const orNull = (v: string | undefined | null) => clean(v) || null
const byLabel = <T extends string>(labels: Record<T, string>, label: string): T | null =>
  (Object.entries(labels) as [T, string][]).find(
    ([, l]) => l.toLowerCase() === label.trim().toLowerCase(),
  )?.[0] ?? null

/** "LKR 12,500" -> 12500. Blank or unreadable -> null. */
export function toAmount(value: string): number | null {
  const text = clean(value).replace(/LKR|Rs\.?|,|\s/gi, '')
  if (!text) return null
  const n = Number(text)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** "lanka pc" -> "Lanka PC": short words are taken to be initials. Mixed case is left alone. */
export function tidyVendor(raw: string): string {
  const name = clean(raw).replace(/\s+/g, ' ')
  if (name !== name.toLowerCase() && name !== name.toUpperCase()) return name
  return name
    .split(' ')
    .map((w) =>
      w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(' ')
}

/**
 * The supplier named in an Action Taken text, as the workbook wrote it:
 * "fix by supplier (lanka pc)" -> "lanka pc".
 */
export function vendorInAction(action: string): string | null {
  const m = /\b(?:supplier|vendor|repair shop)\b[^(]*\(([^)]+)\)/i.exec(action)
  return m ? m[1].trim() || null : null
}

/** Excel dates arrive as a Date, a serial number or text. Returns YYYY-MM-DD. */
export function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const text = String(value).trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  if (iso) return iso[0]
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  // Excel serial: days since 1899-12-30.
  const serial = Number(text)
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    return new Date(Date.UTC(1899, 11, 30 + serial)).toISOString().slice(0, 10)
  }
  return null
}

/**
 * Splits the Notes column into accessory ticks, the accessory detail, and the rest.
 *   "Charger, mouse, mouse pad" -> ticks Charger, Mouse, Mouse pad
 *   "Charger: Lenovo 65W"       -> ticks Charger, note "Lenovo 65W"
 */
export function parseNotes(notes: string): {
  accessories: string[]
  accessoriesNote: string | null
  rest: string | null
} {
  const ticks: string[] = []
  const details: { name: string; detail: string }[] = []
  const leftovers: string[] = []

  for (const raw of clean(notes).split(/[,;]+/)) {
    const part = raw.trim()
    if (!part) continue
    const match = NOTE_ACCESSORIES.find((name) => new RegExp(`^${name}\\b`, 'i').test(part))
    if (!match) {
      leftovers.push(part)
      continue
    }
    if (!ticks.includes(match)) ticks.push(match)
    const detail = part
      .slice(match.length)
      .replace(/^[\s:–-]+/, '')
      .trim()
    if (detail) details.push({ name: match, detail })
  }

  return {
    accessories: ticks,
    // One detail is stored on its own ("Lenovo 65W", as the spec shows). Two or more keep
    // their accessory name, or it would not be clear which is which.
    accessoriesNote:
      details.length === 0
        ? null
        : details.length === 1
          ? details[0].detail
          : details.map((d) => `${d.name}: ${d.detail}`).join('; '),
    rest: leftovers.join(', ') || null,
  }
}

/** Same place written differently ("travel section" / "Travel section") keeps the commonest spelling. */
export function pickSpellings(names: string[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>()
  for (const raw of names) {
    const name = clean(raw)
    if (!name) continue
    const key = name.toLowerCase()
    const forKey = counts.get(key) ?? new Map<string, number>()
    forKey.set(name, (forKey.get(name) ?? 0) + 1)
    counts.set(key, forKey)
  }
  const chosen = new Map<string, string>()
  for (const [key, spellings] of counts) {
    const best = [...spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
    chosen.set(key, best)
  }
  return chosen
}

export function parseWorkbook(sheets: Sheets): ParseResult {
  const warnings: Warning[] = []
  const warn = (message: string) => warnings.push({ level: 'warning', message })
  const note = (message: string) => warnings.push({ level: 'info', message })

  const listRows = sheets['Lists'] ?? []
  const assetRows = sheets['Asset Register'] ?? []
  const changeRows = sheets['Change Log'] ?? []
  if (!assetRows.length) warn('The "Asset Register" tab is empty or missing.')

  // --- Categories, from the Lists tab. Mouse and Keyboard are accessories, not categories.
  const categories = listRows
    .map((r) => ({
      name: clean(r['Category']),
      tag_prefix: clean(r['Tag Prefix']).toUpperCase(),
    }))
    .filter((c) => c.name && c.tag_prefix && !ACCESSORY_CATEGORIES.includes(c.name.toLowerCase()))

  // --- Each row of the register, numbered as Excel shows it (header is row 1).
  type Parsed = { row: Row; line: number; nid: string; category: string }
  const parsed: Parsed[] = assetRows.map((r, i) => ({
    row: r,
    line: i + 2,
    nid: normalizeNid(clean(r['NID No.'])),
    category: clean(r['Category']),
  }))

  // --- People, by normalised NID.
  const employees = new Map<string, ImportPayload['employees'][number]>()
  for (const r of parsed) {
    if (!r.nid) continue
    if (!isValidNid(r.nid)) {
      warn(`Row ${r.line}: the NID is not 12 digits or 9 digits + V/X, so this person is skipped.`)
      continue
    }
    if (employees.has(r.nid)) continue
    employees.set(r.nid, {
      full_name: tidyName(clean(r.row['Assigned To'])),
      nid: r.nid,
      department: orNull(r.row['Department']),
      location: null,
    })
  }

  // --- Accessory rows (mice, keyboards) attach to the laptop or desktop of the same person.
  const accessoryRowsByNid = new Map<string, string[]>()
  let accessoryRows = 0
  for (const r of parsed) {
    if (!ACCESSORY_CATEGORIES.includes(r.category.toLowerCase())) continue
    accessoryRows++
    const name = r.category.charAt(0).toUpperCase() + r.category.slice(1).toLowerCase()
    if (!r.nid) {
      warn(
        `Row ${r.line}: a ${name.toLowerCase()} held by nobody. It is not an asset, so it is skipped.`,
      )
      continue
    }
    const host = parsed.find(
      (h) => h.nid === r.nid && HOST_CATEGORIES.includes(h.category.toLowerCase()),
    )
    if (!host) {
      warn(
        `Row ${r.line}: a ${name.toLowerCase()} whose holder has no laptop or desktop, so it is skipped.`,
      )
      continue
    }
    accessoryRowsByNid.set(host.row['Asset Tag'], [
      ...(accessoryRowsByNid.get(host.row['Asset Tag']) ?? []),
      name,
    ])
  }

  // --- Assets.
  const knownCategories = new Set(categories.map((c) => c.name.toLowerCase()))
  const assets: ImportPayload['assets'] = []
  const seenTags = new Set<string>()
  const seenSerials = new Map<string, string>()

  for (const r of parsed) {
    if (ACCESSORY_CATEGORIES.includes(r.category.toLowerCase())) continue
    const tag = clean(r.row['Asset Tag'])
    if (!tag) continue
    if (seenTags.has(tag)) {
      warn(`Row ${r.line}: the tag ${tag} appears more than once; only the first is imported.`)
      continue
    }
    seenTags.add(tag)
    if (!knownCategories.has(r.category.toLowerCase())) {
      warn(
        `Row ${r.line} (${tag}): the category "${r.category}" is not in the Lists tab, so it is created.`,
      )
      categories.push({ name: r.category, tag_prefix: tag.split('-')[1] ?? 'OTH' })
      knownCategories.add(r.category.toLowerCase())
    }

    const serial = orNull(r.row['Serial Number'])
    if (serial) {
      const first = seenSerials.get(serial.toUpperCase())
      if (first)
        warn(`${tag}: the serial number is already on ${first}, so ${tag} is imported without it.`)
      else seenSerials.set(serial.toUpperCase(), tag)
    }

    const status = byLabel(ASSET_STATUS_LABELS, clean(r.row['Status'])) ?? 'spare'
    if (!byLabel(ASSET_STATUS_LABELS, clean(r.row['Status']))) {
      warn(
        `${tag}: the status "${clean(r.row['Status'])}" is not one we know, so it is imported as Spare.`,
      )
    }
    const condition = byLabel(CONDITION_LABELS, clean(r.row['Condition'])) ?? 'good'

    const notes = parseNotes(clean(r.row['Notes']))
    const model = clean(r.row['Model'])
    const isTbc = model.toUpperCase() === 'TBC'
    const location = clean(r.row['Location / Desk'])
    const nid = r.nid && isValidNid(r.nid) ? r.nid : null

    if (status === 'in_use' && !nid && !location) {
      warn(`${tag}: In Use but with nobody. It is imported as a shared item.`)
    }

    assets.push({
      asset_tag: tag,
      category: r.category,
      make: orNull(r.row['Make']),
      model: isTbc ? null : model || null,
      serial_number: serial && seenSerials.get(serial.toUpperCase()) === tag ? serial : null,
      status,
      condition,
      nid,
      department: orNull(r.row['Department']),
      location: null,
      date_assigned: toIsoDate(r.row['Date Assigned']),
      specification: orNull(r.row['Specification']),
      accessories_note: notes.accessoriesNote,
      notes: [isTbc ? 'model to confirm' : null, notes.rest].filter(Boolean).join(' · ') || null,
      accessories: [
        ...new Set([...notes.accessories, ...(accessoryRowsByNid.get(tag) ?? [])]),
      ].sort(),
    })
  }

  // --- Change Log. The register is the truth, so "To" becomes that asset's current holder.
  const holderOf = new Map(assets.map((a) => [a.asset_tag, a.nid]))
  const change_log: ImportPayload['change_log'] = []
  const seenChangeNos = new Set<string>()
  for (const [i, r] of changeRows.entries()) {
    const no = clean(r['Log ID'])
    const tag = clean(r['Asset Tag'])
    if (!no || !tag) continue
    // Mice and keyboards are not assets, so their rows go too.
    if (!holderOf.has(tag)) continue
    if (seenChangeNos.has(no)) {
      warn(`Change Log row ${i + 2}: ${no} appears more than once; only the first is imported.`)
      continue
    }
    seenChangeNos.add(no)
    const label = clean(r['Change Type'])
    const type = byLabel(CHANGE_TYPE_LABELS, label)
    if (!type) {
      warn(
        `Change Log ${no}: the change type "${label}" is not one we know, so the row is skipped.`,
      )
      continue
    }
    const from = clean(r['From'])
    const to = clean(r['To'])
    const isStore = /^it\s*store$/i.test(from)
    change_log.push({
      change_no: no,
      change_date: toIsoDate(r['Date']),
      asset_tag: tag,
      change_type: type,
      from_location: null,
      // Where it ended up. The workbook's "To" was a person, so the row would otherwise read
      // "IT store ->" with no destination.
      to_location: null,
      // The log used placeholders like "Travel User 1"; the register says who really holds it.
      to_nid: type === 'issued' || type === 'reassigned' ? (holderOf.get(tag) ?? null) : null,
      from_text: isStore ? null : from || null,
      to_text: type === 'issued' || type === 'reassigned' ? null : to || null,
      reason: orNull(r['Reason / Details']),
    })
  }

  // --- Fault Log. A person's name is matched to the register; anyone else keeps the typed name.
  const nidByName = new Map(
    [...employees.values()].map((e) => [e.full_name.toLowerCase(), e.nid] as const),
  )
  const personNid = (raw: string) =>
    raw ? (nidByName.get(tidyName(raw).toLowerCase()) ?? null) : null
  const faults: ImportPayload['faults'] = []
  const seenFaultNos = new Set<string>()
  for (const [i, r] of (sheets['Fault Log'] ?? []).entries()) {
    const no = clean(r['Fault ID'])
    const tag = clean(r['Asset Tag'])
    const description = clean(r['Fault / Issue'])
    if (!no && !tag && !description) continue
    const where = `Fault Log row ${i + 2}`
    if (!/^FLT-\d+$/i.test(no)) {
      warn(`${where}: the Fault ID "${no}" is not like FLT-0001, so the row is skipped.`)
      continue
    }
    if (seenFaultNos.has(no.toUpperCase())) {
      warn(`${where}: ${no} appears more than once; only the first is imported.`)
      continue
    }
    if (!holderOf.has(tag)) {
      warn(`${no}: the asset ${tag || '(none)'} is not in the Asset Register, so it is skipped.`)
      continue
    }
    if (!description) {
      warn(`${no}: there is no Fault / Issue text, so it is skipped.`)
      continue
    }
    seenFaultNos.add(no.toUpperCase())

    const reporter = clean(r['Reported By'])
    const reporterNid = personNid(reporter)
    if (reporter && !reporterNid) {
      note(`${no}: the reporter is not in the Asset Register, so the name is kept as typed.`)
    }
    const action = orNull(r['Action Taken'])
    const vendorText = clean(r['Vendor']) || vendorInAction(action ?? '')
    const dateReported = toIsoDate(r['Date Reported'])
    let dateClosed = toIsoDate(r['Date Closed'])
    const statusLabel = clean(r['Status'])
    let status = byLabel(FAULT_STATUS_LABELS, statusLabel)
    if (!status) {
      status = dateClosed ? 'closed' : 'open'
      if (statusLabel) {
        warn(
          `${no}: the status "${statusLabel}" is not one we know, so it is imported as ${FAULT_STATUS_LABELS[status]}.`,
        )
      }
    }
    if (status === 'closed' && !dateClosed) dateClosed = dateReported
    const costText = clean(r['Cost (LKR)'])
    const cost = toAmount(costText)
    if (costText && cost === null) {
      warn(`${no}: the cost "${costText}" is not a number, so it is imported as 0.`)
    }
    const responsible = clean(r['Responsible'])
    const responsibleNid = personNid(responsible)
    if (responsible && !responsibleNid) {
      warn(`${no}: "Responsible" names someone not in the Asset Register, so it is left blank.`)
    }

    faults.push({
      fault_no: no.toUpperCase(),
      asset_tag: tag,
      date_reported: dateReported,
      reported_by_nid: reporterNid,
      reported_by_name: reporter && !reporterNid ? tidyName(reporter) : null,
      description,
      action_taken: action,
      vendor: vendorText ? tidyVendor(vendorText) : null,
      cost: cost ?? 0,
      status,
      date_closed: status === 'closed' ? dateClosed : null,
      under_warranty: /^(yes|y|true)$/i.test(clean(r['Under Warranty'])),
      cause: byLabel(FAULT_CAUSE_LABELS, clean(r['Cause'])),
      responsible_nid: responsibleNid,
      remarks: orNull(r['Remarks']),
    })
  }

  // --- Consumables: what came in and what went out become the opening balance.
  const stock: ImportPayload['stock'] = []
  for (const [i, r] of (sheets['Consumables'] ?? []).entries()) {
    const raw = clean(r['Item'])
    if (!raw) continue
    const name = raw === raw.toLowerCase() ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw
    const received = toAmount(r['Qty Received']) ?? 0
    const issued = toAmount(r['Qty Issued']) ?? 0
    if (!Number.isInteger(received) || !Number.isInteger(issued)) {
      warn(
        `Consumables row ${i + 2} (${name}): quantities must be whole numbers, so it is skipped.`,
      )
      continue
    }
    if (issued > received) {
      warn(
        `Consumables row ${i + 2} (${name}): ${issued} issued but only ${received} received. Stock cannot go below 0, so it is skipped.`,
      )
      continue
    }
    note(`${name}: opening stock ${received - issued} (${received} received, ${issued} issued).`)
    stock.push({
      name,
      reorder_level: toAmount(r['Reorder Level']),
      qty_received: received,
      qty_issued: issued,
    })
  }

  // Locations are no longer used (Sahan, 15/10/2026): a Location / Desk column is ignored.
  const locations: { name: string }[] = []

  return {
    payload: {
      categories,
      locations,
      employees: [...employees.values()],
      assets,
      change_log,
      faults,
      stock,
    },
    warnings,
    counts: {
      categories: categories.length,
      locations: locations.length,
      employees: employees.size,
      assets: assets.length,
      changes: change_log.length,
      faults: faults.length,
      stock: stock.length,
    },
    accessoryRows,
  }
}
