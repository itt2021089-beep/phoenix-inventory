import type { CustomField } from '@/lib/db'

/** "Gas type" -> "gas_type". Keys are made once, from the label, and never edited after. */
export function keyFromLabel(label: string, taken: string[]): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'field'
  let key = base
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`
  return key
}

/** Comma-separated options for a "select" field, trimmed and de-duplicated. */
export function parseOptions(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  ]
}

/** Problems that would make a field list unusable, as messages. */
export function validateFields(fields: CustomField[]): string[] {
  const problems: string[] = []
  const keys = new Set<string>()
  for (const f of fields) {
    if (!f.label.trim()) problems.push('Every field needs a label.')
    if (keys.has(f.key)) problems.push(`Two fields share the key "${f.key}".`)
    keys.add(f.key)
    if (f.type === 'select' && !f.options?.length)
      problems.push(`"${f.label}" needs at least one option.`)
  }
  return [...new Set(problems)]
}
