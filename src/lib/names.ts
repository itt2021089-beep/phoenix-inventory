/**
 * "test person one" -> "Test Person One". Applied only when the whole name was typed in one
 * case, so a deliberate spelling ("de Silva", "McDonald") is left alone.
 */
export function tidyName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ')
  const allLower = name === name.toLowerCase()
  const allUpper = name === name.toUpperCase()
  if (!allLower && !allUpper) return name
  return name
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}
