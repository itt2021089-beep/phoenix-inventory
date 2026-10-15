import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { z } from 'zod'

import { Field } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { activeOr, useDepartments, useLocations } from '@/features/lookups/useLookups'
import { errorMessage } from '@/lib/errors'
import { todayInColombo } from '@/lib/format'
import { tidyName } from '@/lib/names'
import { nidProblem, normalizeNid } from '@/lib/nid'
import { supabase } from '@/lib/supabase'

import { peopleKeys, usePerson } from './api'

const schema = z.object({
  full_name: z.string().trim().min(2, 'Enter their full name'),
  nid: z.string().superRefine((v, ctx) => {
    const problem = nidProblem(v)
    if (problem) ctx.addIssue({ code: 'custom', message: problem })
  }),
  department_id: z.string(),
  designation: z.string().trim(),
  contact_no: z.string().trim(),
  default_location_id: z.string(),
  joined_on: z.union([z.literal(''), z.iso.date('Use a valid date')]),
  notes: z.string().trim(),
})
type Values = z.infer<typeof schema>

const EMPTY: Values = {
  full_name: '',
  nid: '',
  department_id: '',
  designation: '',
  contact_no: '',
  default_location_id: '',
  joined_on: '',
  notes: '',
}

const orNull = (v: string) => (v.trim() === '' ? null : v.trim())

export function PersonFormPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const person = usePerson(id)
  const departments = useDepartments()
  const locations = useLocations()

  const { register, handleSubmit, reset, control, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    // A new joiner is usually added on their first day.
    defaultValues: isNew ? { ...EMPTY, joined_on: todayInColombo() } : EMPTY,
  })
  // Where to go after saving a new person: their page, or straight to issuing their devices.
  const after = useRef<'page' | 'issue'>('page')
  const { errors, isDirty } = formState
  const typedNid = useWatch({ control, name: 'nid' })
  const normalized = normalizeNid(typedNid ?? '')

  useEffect(() => {
    const p = person.data
    if (!p) return
    reset({
      full_name: p.full_name,
      nid: p.nid,
      department_id: p.department_id ? String(p.department_id) : '',
      designation: p.designation ?? '',
      contact_no: p.contact_no ?? '',
      default_location_id: p.default_location_id ? String(p.default_location_id) : '',
      joined_on: p.joined_on ?? '',
      notes: p.notes ?? '',
    })
  }, [person.data, reset])

  const save = useMutation({
    mutationFn: async (v: Values) => {
      const row = {
        full_name: tidyName(v.full_name),
        nid: normalizeNid(v.nid),
        department_id: v.department_id ? Number(v.department_id) : null,
        designation: orNull(v.designation),
        contact_no: orNull(v.contact_no),
        default_location_id: v.default_location_id ? Number(v.default_location_id) : null,
        joined_on: orNull(v.joined_on),
        notes: orNull(v.notes),
      }
      if (isNew) {
        const { data, error } = await supabase.from('employees').insert(row).select('id').single()
        if (error) throw error
        return data.id
      }
      const { error } = await supabase.from('employees').update(row).eq('id', id!)
      if (error) throw error
      return id!
    },
    onSuccess: (savedId) => {
      void qc.invalidateQueries({ queryKey: peopleKeys.all })
      navigate(
        isNew && after.current === 'issue'
          ? `/issue?employee=${savedId}&joiner=1`
          : `/people/${savedId}`,
      )
    },
  })

  if (!isNew && !person.data) {
    return (
      <>
        <PageHeader title="Edit person" />
        <QueryState isLoading={person.isLoading} error={person.error} />
      </>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={isNew ? 'Add person' : `Edit ${person.data?.full_name}`}
        description="Their desk is used as the default location when you issue them something."
      />
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="grid gap-4" noValidate>
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="full_name" error={errors.full_name?.message}>
              <Input id="full_name" autoComplete="off" {...register('full_name')} />
            </Field>
            <Field
              label="NID No."
              htmlFor="nid"
              error={errors.nid?.message}
              hint={
                normalized && normalized !== typedNid?.trim()
                  ? `Saved as ${normalized}`
                  : '12 digits, or 9 digits + V. "NIC" and spaces are removed.'
              }
            >
              <Input id="nid" autoComplete="off" className="font-mono" {...register('nid')} />
            </Field>
            <Field label="Department" htmlFor="department_id">
              <NativeSelect id="department_id" {...register('department_id')}>
                <option value="">None</option>
                {activeOr(departments.data, person.data?.department_id).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Designation" htmlFor="designation">
              <Input id="designation" {...register('designation')} />
            </Field>
            <Field
              label="Desk / location"
              htmlFor="default_location_id"
              hint="Add desks in Settings → Locations."
            >
              <NativeSelect id="default_location_id" {...register('default_location_id')}>
                <option value="">None</option>
                {activeOr(locations.data, person.data?.default_location_id).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Contact no." htmlFor="contact_no">
              <Input id="contact_no" type="tel" {...register('contact_no')} />
            </Field>
            <Field label="Joined on" htmlFor="joined_on" error={errors.joined_on?.message}>
              <Input id="joined_on" type="date" {...register('joined_on')} />
            </Field>
            <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
              <Textarea id="notes" rows={2} {...register('notes')} />
            </Field>
          </CardContent>
        </Card>
        {save.error && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(save.error)}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          {isNew && (
            <Button
              type="submit"
              disabled={save.isPending}
              onClick={() => (after.current = 'issue')}
            >
              {save.isPending ? 'Saving...' : 'Save and issue devices'}
            </Button>
          )}
          <Button
            type="submit"
            variant={isNew ? 'outline' : 'default'}
            disabled={(!isNew && !isDirty) || save.isPending}
            onClick={() => (after.current = 'page')}
          >
            {save.isPending ? 'Saving...' : isNew ? 'Save only' : 'Save'}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to={isNew ? '/people' : `/people/${id}`}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
