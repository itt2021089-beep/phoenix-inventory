import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
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
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export type Column = {
  key: string
  label: string
  type?: 'text' | 'select' | 'email' | 'tel'
  options?: { value: string; label: string }[]
  required?: boolean
  /** Shown in the table; defaults to the raw value. */
  show?: (row: Row) => string
  /** Hidden in the table on small screens. */
  wide?: boolean
}

type Row = Record<string, unknown> & { id: number; is_active: boolean }
type Table = 'departments' | 'locations' | 'vendors' | 'accessory_types'

/**
 * Add / edit / deactivate rows of a short reference list. No delete: a row that is no longer
 * used is deactivated, so old records keep their names (CLAUDE.md, rule 4).
 */
export function ListEditor({
  table,
  rows,
  columns,
  canEdit,
  noun,
}: {
  table: Table
  rows: Row[]
  columns: Column[]
  canEdit: boolean
  noun: string
}) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')

  const save = useMutation({
    mutationFn: async (values: Record<string, string | number | null>) => {
      const query =
        editing === 'new'
          ? supabase.from(table).insert(values as never)
          : supabase
              .from(table)
              .update(values as never)
              .eq('id', editing as number)
      const { error } = await query
      if (error) throw error
    },
    onSuccess: () => {
      setEditing(null)
      void qc.invalidateQueries({ queryKey: lookupKeys.all })
    },
  })

  const toggle = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase
        .from(table)
        .update({ is_active: !row.is_active } as never)
        .eq('id', row.id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: lookupKeys.all }),
  })

  function start(row: Row | null) {
    save.reset()
    setEditing(row ? row.id : 'new')
    setDraft(
      Object.fromEntries(
        columns.map((c) => {
          if (row?.[c.key] != null) return [c.key, String(row[c.key])]
          // A required list has no "None" choice, so the browser shows its first option. Start
          // on that option, or a blank would be sent while the screen showed a choice.
          if (c.type === 'select' && c.required) return [c.key, c.options?.[0]?.value ?? '']
          return [c.key, '']
        }),
      ),
    )
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    save.mutate(
      Object.fromEntries(
        columns.map((c) => {
          const v = (draft[c.key] ?? '').trim()
          // Foreign keys and optional text: blank means null.
          return [c.key, v === '' ? null : c.key.endsWith('_id') ? Number(v) : v]
        }),
      ),
    )
  }

  const needle = q.trim().toLowerCase()
  const shown = rows.filter(
    (r) =>
      !needle ||
      columns.some((c) =>
        String(c.show?.(r) ?? r[c.key] ?? '')
          .toLowerCase()
          .includes(needle),
      ),
  )

  const form = (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border bg-muted/40 p-3 sm:grid-cols-2">
      {columns.map((c) => (
        <Field
          key={c.key}
          label={c.required ? `${c.label} *` : c.label}
          htmlFor={`${table}-${c.key}`}
        >
          {c.type === 'select' ? (
            <NativeSelect
              id={`${table}-${c.key}`}
              value={draft[c.key] ?? ''}
              onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
            >
              {!c.required && <option value="">None</option>}
              {c.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <Input
              id={`${table}-${c.key}`}
              type={c.type ?? 'text'}
              required={c.required}
              value={draft[c.key] ?? ''}
              onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
            />
          )}
        </Field>
      ))}
      {save.error && (
        <Alert variant="destructive" className="sm:col-span-2">
          <AlertDescription>{errorMessage(save.error)}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2 sm:col-span-2">
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
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder={`Search ${noun}s`}
          aria-label={`Search ${noun}s`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        {canEdit && editing === null && (
          <Button size="sm" onClick={() => start(null)}>
            <Plus /> Add {noun}
          </Button>
        )}
      </div>
      {editing === 'new' && form}
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} className={c.wide ? 'hidden md:table-cell' : undefined}>
                {c.label}
              </TableHead>
            ))}
            <TableHead>Active</TableHead>
            {canEdit && <TableHead className="w-0" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((r) =>
            editing === r.id ? (
              <TableRow key={r.id}>
                <TableCell colSpan={columns.length + 2}>{form}</TableCell>
              </TableRow>
            ) : (
              <TableRow key={r.id} className={r.is_active ? undefined : 'text-muted-foreground'}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.wide ? 'hidden md:table-cell' : undefined}>
                    {c.show ? c.show(r) : String(r[c.key] ?? '')}
                  </TableCell>
                ))}
                <TableCell>
                  {canEdit ? (
                    <input
                      type="checkbox"
                      className="size-4"
                      aria-label={`${String(r.name)} is active`}
                      checked={r.is_active}
                      disabled={toggle.isPending}
                      onChange={() => toggle.mutate(r)}
                    />
                  ) : r.is_active ? (
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
                      aria-label={`Edit ${String(r.name)}`}
                      onClick={() => start(r)}
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
