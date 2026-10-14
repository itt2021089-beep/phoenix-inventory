import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Field } from '@/components/Field'
import { QueryState } from '@/components/QueryState'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { dashboardKeys } from '@/features/dashboard/useDashboard'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

import { currentValues, THRESHOLDS, validateThreshold } from './thresholds'

const KEYS = THRESHOLDS.map((t) => t.key)

function useThresholdRows() {
  return useQuery({
    queryKey: ['settings', 'thresholds'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('key, value').in('key', KEYS)
      if (error) throw error
      return data ?? []
    },
  })
}

function useSaveThresholds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Record<string, number>) => {
      const { error } = await supabase.from('settings').upsert(
        Object.entries(values).map(([key, value]) => ({ key, value })),
        { onConflict: 'key' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] })
      // The dashboard's flags, reminders and window all depend on these.
      void qc.invalidateQueries({ queryKey: dashboardKeys.all })
    },
  })
}

/** The thresholds for reminders, repair-vs-replace and QR reports. Only IT can change them. */
export function ThresholdsEditor({ canEdit }: { canEdit: boolean }) {
  const rows = useThresholdRows()
  // Kept here, not in the form: saving refreshes the stored values, which rebuilds the form.
  const [saved, setSaved] = useState(false)
  if (!rows.data) return <QueryState isLoading={rows.isLoading} error={rows.error} />
  // Keyed on what is stored, so a save (or another tab's save) refreshes the boxes.
  return (
    <ThresholdsForm
      key={JSON.stringify(rows.data)}
      initial={currentValues(rows.data)}
      canEdit={canEdit}
      saved={saved}
      setSaved={setSaved}
    />
  )
}

function ThresholdsForm({
  initial,
  canEdit,
  saved,
  setSaved,
}: {
  initial: ReturnType<typeof currentValues>
  canEdit: boolean
  saved: boolean
  setSaved: (saved: boolean) => void
}) {
  const save = useSaveThresholds()
  const [text, setText] = useState(() =>
    Object.fromEntries(THRESHOLDS.map((t) => [t.key, String(initial[t.key])])),
  )
  const errors = Object.fromEntries(
    THRESHOLDS.map((t) => [t.key, validateThreshold(t, text[t.key])]),
  )
  const invalid = Object.values(errors).some(Boolean)
  const unchanged = THRESHOLDS.every((t) => Number(text[t.key]) === initial[t.key])

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        setSaved(false)
        save.mutate(Object.fromEntries(THRESHOLDS.map((t) => [t.key, Number(text[t.key])])), {
          onSuccess: () => setSaved(true),
        })
      }}
    >
      {THRESHOLDS.map((t) => (
        <Field
          key={t.key}
          label={t.label}
          htmlFor={`threshold-${t.key}`}
          hint={t.hint}
          error={canEdit ? (errors[t.key] ?? undefined) : undefined}
        >
          <div className="flex items-center gap-2">
            <Input
              id={`threshold-${t.key}`}
              inputMode="numeric"
              className="max-w-28"
              value={text[t.key]}
              disabled={!canEdit}
              onChange={(e) => {
                setSaved(false)
                setText({ ...text, [t.key]: e.target.value })
              }}
            />
            {t.suffix && <span className="text-sm text-muted-foreground">{t.suffix}</span>}
          </div>
        </Field>
      ))}
      {save.error && (
        <Alert variant="destructive" className="sm:col-span-2">
          <AlertDescription>{errorMessage(save.error)}</AlertDescription>
        </Alert>
      )}
      {canEdit && (
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={invalid || unchanged || save.isPending}>
            {save.isPending ? 'Saving...' : 'Save'}
          </Button>
          {saved && (
            <span role="status" className="text-sm text-muted-foreground">
              Saved.
            </span>
          )}
        </div>
      )}
    </form>
  )
}
