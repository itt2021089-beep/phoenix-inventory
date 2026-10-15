import type { Json } from '@/lib/database.types'
import { type Category, type CustomField, customFieldsOf } from '@/lib/db'

import { parseOptions, validateFields } from './customFieldsEditor'

export type Draft = {
  name: string
  category_group: string
  tag_prefix: string
  min_spares: string
  service_interval_days: string
  fields: (CustomField & { optionsText: string; saved: boolean })[]
}

export function toDraft(c: Category | null): Draft {
  return {
    name: c?.name ?? '',
    category_group: c?.category_group ?? 'it',
    tag_prefix: c?.tag_prefix ?? '',
    min_spares: String(c?.min_spares ?? 0),
    service_interval_days: c?.service_interval_days == null ? '' : String(c.service_interval_days),
    fields: customFieldsOf(c ?? undefined).map((f) => ({
      ...f,
      optionsText: (f.options ?? []).join(', '),
      saved: true,
    })),
  }
}

/** Draft -> a categories row, or the problems that stop it saving. */
export function draftToRow(d: Draft): { row?: Record<string, Json>; problems: string[] } {
  const problems: string[] = []
  const nonNegInt = (v: string, label: string, allowBlank: boolean) => {
    if (v.trim() === '') return allowBlank ? null : (problems.push(`${label} is required.`), null)
    if (!/^\d+$/.test(v.trim())) problems.push(`${label} must be a whole number.`)
    return Number(v)
  }
  if (!d.name.trim()) problems.push('Name is required.')
  const prefix = d.tag_prefix.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(prefix)) problems.push('The prefix is exactly 3 letters, e.g. LAP.')
  const min = nonNegInt(d.min_spares, 'Min spares', false)
  const interval = nonNegInt(d.service_interval_days, 'Service interval', true)
  if (interval === 0) problems.push('Service interval must be at least 1 day, or blank for none.')
  const fields: CustomField[] = d.fields.map((f) => ({
    key: f.key,
    label: f.label.trim(),
    type: f.type,
    ...(f.type === 'select' ? { options: parseOptions(f.optionsText) } : {}),
    required: f.required === true,
  }))
  problems.push(...validateFields(fields))
  if (problems.length) return { problems }
  return {
    problems,
    row: {
      name: d.name.trim(),
      category_group: d.category_group,
      tag_prefix: prefix,
      min_spares: min,
      service_interval_days: interval,
      custom_fields: fields as unknown as Json,
    },
  }
}
