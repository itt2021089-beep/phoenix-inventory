/**
 * Reads Sahan's Excel workbook into the shape import_workbook() expects
 * (the mapping table in docs/BUILD_PLAN.md).
 *
 * Everything here is a pure function over plain rows, so the rules can be tested without a
 * spreadsheet. The file itself is read in the browser; nothing is uploaded anywhere.
 *
 * Privacy: a warning never contains an NID. It points at a row number instead.
 */
import { ASSET_STATUS_LABELS, CONDITION_LABELS } from '@/lib/constants'
import type { AssetStatus, Condition } from '@/lib/db'
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
    to_nid: string | null
    from_text: string | null
    to_text: string | null
    reason: string | null
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

  // --- Locations, de-duplicated case-insensitively.
  const spelling = pickSpellings(assetRows.map((r) => r['Location / Desk']))

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
    const location = clean(r.row['Location / Desk'])
    employees.set(r.nid, {
      full_name: tidyName(clean(r.row['Assigned To'])),
      nid: r.nid,
      department: orNull(r.row['Department']),
      location: location ? (spelling.get(location.toLowerCase()) ?? location) : null,
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
      warn(`${tag}: In Use but with nobody and no location.`)
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
      location: location ? (spelling.get(location.toLowerCase()) ?? location) : null,
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
    const type = byLabel(
      {
        received_new: 'Received (New)',
        issued: 'Issued',
        returned: 'Returned',
        reassigned: 'Reassigned',
        location_changed: 'Location Changed',
        sent_for_repair: 'Sent for Repair',
        back_from_repair: 'Back from Repair',
        upgraded: 'Upgraded',
        part_replaced: 'Part Replaced',
        os_reinstalled: 'OS Reinstalled',
        retired: 'Retired',
        disposed: 'Disposed',
      },
      label,
    )
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
      from_location: isStore ? 'IT store' : null,
      // The log used placeholders like "Travel User 1"; the register says who really holds it.
      to_nid: type === 'issued' || type === 'reassigned' ? (holderOf.get(tag) ?? null) : null,
      from_text: isStore ? null : from || null,
      to_text: type === 'issued' || type === 'reassigned' ? null : to || null,
      reason: orNull(r['Reason / Details']),
    })
  }

  for (const tab of ['Fault Log', 'Consumables']) {
    if (sheets[tab]?.length) {
      note(
        `The "${tab}" tab is imported in Phase 2, with the screens that use it. Nothing is lost.`,
      )
    }
  }

  const locations = [...new Set(assets.map((a) => a.location).filter((l): l is string => !!l))]
    .sort()
    .map((name) => ({ name }))

  return {
    payload: { categories, locations, employees: [...employees.values()], assets, change_log },
    warnings,
    counts: {
      categories: categories.length,
      locations: locations.length,
      employees: employees.size,
      assets: assets.length,
      changes: change_log.length,
    },
    accessoryRows,
  }
}
