import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Field } from '@/components/Field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { lookupKeys } from '@/features/lookups/useLookups'
import { CATEGORY_GROUP_LABELS } from '@/lib/constants'
import type { Json } from '@/lib/database.types'
import { type Category, type CustomField, customFieldsOf } from '@/lib/db'
import { errorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/format'
import { supabase } from '@/lib/supabase'

import { type Draft, draftToRow, toDraft } from './categoryDraft'
import { keyFromLabel } from './customFieldsEditor'

const FIELD_TYPES: CustomField['type'][] = ['text', 'number', 'date', 'boolean', 'select']
const FIELD_TYPE_LABELS: Record<CustomField['type'], string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  boolean: 'Yes / No',
  select: 'Pick from a list',
}

export function CategoriesEditor({ rows, canEdit }: { rows: Category[]; canEdit: boolean }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(toDraft(null))
  const [problems, setProblems] = useState<string[]>([])

  const save = useMutation({
    mutationFn: async (row: Record<string, Json>) => {
      const { error } =
        editing === 'new'
          ? await supabase.from('categories').insert(row as never)
          : await supabase
              .from('categories')
              .update(row as never)
              .eq('id', editing as number)
      if (error) throw error
    },
    onSuccess: () => {
      setEditing(null)
      void qc.invalidateQueries({ queryKey: lookupKeys.all })
    },
  })

  const toggle = useMutation({
    mutationFn: async (c: Category) => {
      const { error } = await supabase
        .from('categories')
        .update({ is_active: !c.is_active })
        .eq('id', c.id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: lookupKeys.all }),
  })

  function start(c: Category | null) {
    save.reset()
    setProblems([])
    setDraft(toDraft(c))
    setEditing(c ? c.id : 'new')
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const { row, problems } = draftToRow(draft)
    setProblems(problems)
    if (row) save.mutate(row)
  }

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const setField = (i: number, patch: Partial<Draft['fields'][number]>) =>
    set({ fields: draft.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) })

  const form = (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border bg-muted/40 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name *" htmlFor="cat-name">
          <Input id="cat-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Group" htmlFor="cat-group">
          <NativeSelect
            id="cat-group"
            value={draft.category_group}
            onChange={(e) => set({ category_group: e.target.value })}
          >
            {Object.entries(CATEGORY_GROUP_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="Tag prefix *"
          htmlFor="cat-prefix"
          hint="3 letters. Fixed once any asset uses it."
        >
          <Input
            id="cat-prefix"
            maxLength={3}
            className="font-mono uppercase"
            value={draft.tag_prefix}
            onChange={(e) => set({ tag_prefix: e.target.value.toUpperCase() })}
          />
        </Field>
        <Field label="Min spares" htmlFor="cat-min" hint="The dashboard warns below this.">
          <Input
            id="cat-min"
            inputMode="numeric"
            value={draft.min_spares}
            onChange={(e) => set({ min_spares: e.target.value })}
          />
        </Field>
        <Field
          label="Typical replacement cost (LKR)"
          htmlFor="cat-cost"
          hint="Used when the purchase price is unknown."
        >
          <Input
            id="cat-cost"
            inputMode="decimal"
            value={draft.typical_replacement_cost}
            onChange={(e) => set({ typical_replacement_cost: e.target.value })}
          />
        </Field>
        <Field
          label="Service interval (days)"
          htmlFor="cat-interval"
          hint="Blank: no routine service."
        >
          <Input
            id="cat-interval"
            inputMode="numeric"
            value={draft.service_interval_days}
            onChange={(e) => set({ service_interval_days: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium">Extra fields on this category&apos;s assets</p>
        {draft.fields.length === 0 && <p className="text-xs text-muted-foreground">None.</p>}
        {draft.fields.map((f, i) => (
          <div
            key={f.key}
            className="grid items-end gap-2 rounded-md border bg-background p-2 sm:grid-cols-[1fr_10rem_1fr_auto_auto]"
          >
            <Field label="Label" htmlFor={`f-${f.key}-label`}>
              <Input
                id={`f-${f.key}-label`}
                value={f.label}
                onChange={(e) => setField(i, { label: e.target.value })}
              />
            </Field>
            <Field label="Type" htmlFor={`f-${f.key}-type`}>
              <NativeSelect
                id={`f-${f.key}-type`}
                value={f.type}
                onChange={(e) => setField(i, { type: e.target.value as CustomField['type'] })}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {f.type === 'select' ? (
              <Field label="Options (comma-separated)" htmlFor={`f-${f.key}-options`}>
                <Input
                  id={`f-${f.key}-options`}
                  value={f.optionsText}
                  onChange={(e) => setField(i, { optionsText: e.target.value })}
                />
              </Field>
            ) : (
              <span />
            )}
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={f.required === true}
                onChange={(e) => setField(i, { required: e.target.checked })}
              />
              Required
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${f.label || 'field'}`}
              title={
                f.saved ? 'Assets keep any value already stored; it just stops showing.' : undefined
              }
              onClick={() => set({ fields: draft.fields.filter((_, j) => j !== i) })}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const label = 'New field'
              const key = keyFromLabel(
                `${label} ${draft.fields.length + 1}`,
                draft.fields.map((f) => f.key),
              )
              set({
                fields: [
                  ...draft.fields,
                  { key, label: '', type: 'text', optionsText: '', saved: false },
                ],
              })
            }}
          >
            <Plus /> Add field
          </Button>
        </div>
      </div>

      {(problems.length > 0 || save.error) && (
        <Alert variant="destructive">
          <AlertDescription>
            {problems.length ? problems.join(' ') : errorMessage(save.error)}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? 'Saving...' : 'Save'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>
          Cancel
        </Button>
      </div>
    </form>
  )

  return (
    <div className="space-y-3">
      {canEdit && editing === null && (
        <Button size="sm" onClick={() => start(null)}>
          <Plus /> Add category
        </Button>
      )}
      {editing === 'new' && form}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            <TableHead>Prefix</TableHead>
            <TableHead className="hidden md:table-cell">Next tag</TableHead>
            <TableHead className="text-right">Min spares</TableHead>
            <TableHead className="hidden text-right md:table-cell">Typical cost</TableHead>
            <TableHead className="hidden text-right md:table-cell">Service every</TableHead>
            <TableHead className="hidden lg:table-cell">Extra fields</TableHead>
            <TableHead>Active</TableHead>
            {canEdit && <TableHead className="w-0" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) =>
            editing === c.id ? (
              <TableRow key={c.id}>
                <TableCell colSpan={9}>{form}</TableCell>
              </TableRow>
            ) : (
              <TableRow key={c.id} className={c.is_active ? undefined : 'text-muted-foreground'}>
                <TableCell>
                  {c.name}
                  {c.category_group === 'facilities' && (
                    <span className="ml-1 text-xs text-muted-foreground">(Facilities)</span>
                  )}
                </TableCell>
                <TableCell className="font-mono">{c.tag_prefix}</TableCell>
                <TableCell className="hidden font-mono text-xs md:table-cell">
                  PBS-{c.tag_prefix}-{String(c.next_tag_number).padStart(3, '0')}
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.min_spares}</TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">
                  {formatMoney(c.typical_replacement_cost)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">
                  {c.service_interval_days ? `${c.service_interval_days} days` : ''}
                </TableCell>
                <TableCell className="hidden text-xs lg:table-cell">
                  {customFieldsOf(c)
                    .map((f) => f.label)
                    .join(', ')}
                </TableCell>
                <TableCell>
                  {canEdit ? (
                    <input
                      type="checkbox"
                      className="size-4"
                      aria-label={`${c.name} is active`}
                      checked={c.is_active}
                      disabled={toggle.isPending}
                      onChange={() => toggle.mutate(c)}
                    />
                  ) : c.is_active ? (
                    'Yes'
                  ) : (
                    'No'
                  )}
                </TableCell>
                {canEdit && (
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Edit ${c.name}`}
                      onClick={() => start(c)}
                    >
                      <Pencil />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
      {toggle.error && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(toggle.error)}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
