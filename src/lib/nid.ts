/**
 * Sri Lankan National ID (NIC) numbers, the only way staff are identified (CLAUDE.md).
 *
 * Stored normalised: no "NIC" prefix, no spaces, uppercase. Two formats exist:
 *   old: 9 digits + V or X  (e.g. 901234567V)
 *   new: 12 digits          (e.g. 200012345678)
 * The database checks the same pattern (employees_nid_check), so this is the friendly
 * first line, not the only one. Used by the People form and the workbook import.
 */
export const NID_PATTERN = /^([0-9]{12}|[0-9]{9}[VX])$/

export function normalizeNid(raw: string): string {
  return raw
    .trim()
    .replace(/^NIC[\s.:#-]*/i, '')
    .replace(/\s+/g, '')
    .toUpperCase()
}

export function isValidNid(normalized: string): boolean {
  return NID_PATTERN.test(normalized)
}

/** A message for a typed NID, or null when it is fine. Never echoes the NID itself. */
export function nidProblem(raw: string): string | null {
  const n = normalizeNid(raw)
  if (!n) return 'Enter the NID number.'
  if (isValidNid(n)) return null
  if (/^[0-9]{9}$/.test(n)) return 'Old-format NIDs end in V or X (9 digits + V).'
  return 'An NID is 12 digits, or 9 digits followed by V or X.'
}
