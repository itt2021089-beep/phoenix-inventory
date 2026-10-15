import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router'
import type { z } from 'zod'

import { Field } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { dashboardKeys } from '@/features/dashboard/useDashboard'
import { activeOr, lookupKeys, useCategories, useDepartments } from '@/features/lookups/useLookups'
import { CATEGORY_GROUP_LABELS, COMMON } from '@/lib/constants'
import { customFieldsOf } from '@/lib/db'
import { errorMessage } from '@/lib/errors'
import { todayInColombo } from '@/lib/format'
import { supabase } from '@/lib/supabase'

import { assetKeys, useAsset } from './api'
import { AssetFields } from './AssetFields'
import {
  addAssetsSchema,
  type AddAssetsValues,
  customValuesToForm,
  duplicateSerials,
  effectiveQuantity,
  missingRequired,
  parseSerials,
  tagPreview,
  toAddAssetsArgs,
} from './assetForm'

type Output = z.output<typeof addAssetsSchema>

function emptyValues(): AddAssetsValues {
  return {
    category_id: '',
    quantity: '1',
    serials: '',
    make: '',
    model: '',
    condition: 'new',
    specification: '',
    accessories_note: '',
    purchase_date: '',
    purchase_price: '',
    supplier_id: '',
    invoice_no: '',
    warranty_until: '',
    notes: '',
    custom_values: {},
    department_id: '',
    received_date: todayInColombo(),
    reason: '',
  }
}

export function AddAssetPage() {
  const [params] = useSearchParams()
  const fromTag = params.get('from') ?? undefined
  const source = useAsset(fromTag)
  const categories = useCategories()
  const departments = useDepartments()
  const queryClient = useQueryClient()
  const [created, setCreated] = useState<string[] | null>(null)

  const form = useForm<AddAssetsValues, unknown, Output>({
    resolver: zodResolver(addAssetsSchema),
    defaultValues: emptyValues(),
  })
  const { register, handleSubmit, control, reset, setError, formState } = form
  const { errors } = formState

  const [categoryId, serialsText, quantityText, make] = useWatch({
    control,
    name: ['category_id', 'serials', 'quantity', 'make'],
  })
  const category = categories.data?.find((c) => String(c.id) === categoryId)
  const customFields = useMemo(() => customFieldsOf(category), [category])
  const serials = parseSerials(serialsText ?? '')
  const typedQuantity = Number(quantityText) || 1
  const quantity = effectiveQuantity(typedQuantity, serials)
  const dupes = duplicateSerials(serials)

  // "Duplicate this asset": everything but the serial, the tag and where it is now.
  useEffect(() => {
    const a = source.data
    if (!a || !categories.data) return
    const cat = categories.data.find((c) => c.id === a.category_id)
    reset({
      ...emptyValues(),
      category_id: String(a.category_id),
      make: a.make ?? '',
      model: a.model ?? '',
      condition: a.condition as AddAssetsValues['condition'],
      specification: a.specification ?? '',
      accessories_note: a.accessories_note ?? '',
      purchase_date: a.purchase_date ?? '',
      purchase_price: a.purchase_price === null ? '' : String(a.purchase_price),
      supplier_id: a.supplier_id ? String(a.supplier_id) : '',
      invoice_no: a.invoice_no ?? '',
      warranty_until: a.warranty_until ?? '',
      notes: '',
      custom_values: customValuesToForm(customFieldsOf(cat), a.custom_values),
    })
  }, [source.data, categories.data, reset])

  const add = useMutation({
    mutationFn: async (values: Output) => {
      const { data, error } = await supabase.rpc(
        'add_assets',
        toAddAssetsArgs(values, customFields),
      )
      if (error) throw error
      return data
    },
    onSuccess: (tags) => {
      setCreated(tags)
      void queryClient.invalidateQueries({ queryKey: assetKeys.all })
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
      void queryClient.invalidateQueries({ queryKey: lookupKeys.categories })
    },
  })

  function onSubmit(values: Output) {
    const missing = missingRequired(customFields, values.custom_values)
    if (missing.length) {
      setError('root', { message: `Fill in: ${missing.join(', ')}` })
      return
    }
    if (dupes.length) {
      setError('serials', { message: `Listed twice: ${dupes.join(', ')}` })
      return
    }
    add.mutate(values)
  }

  if (created) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Assets added" />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-green-600" />
              {created.length} new asset{created.length === 1 ? '' : 's'}, all Spare
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="flex flex-wrap gap-2">
              {created.map((tag) => (
                <li key={tag}>
                  <Link
                    className="rounded-md border px-2 py-1 font-mono text-sm hover:bg-accent"
                    to={`/assets/${tag}`}
                  >
                    {tag}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Each one has a Received (New) row in its Change Log.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  // Same details again, ready for the next batch: only serials are cleared.
                  form.setValue('serials', '')
                  form.setValue('quantity', '1')
                  setCreated(null)
                  add.reset()
                }}
              >
                Add more like these
              </Button>
              <Button variant="outline" asChild>
                <Link to="/assets">Back to assets</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={fromTag ? `Duplicate ${fromTag}` : 'Add assets'}
        description="New assets start as Spare, with the next free tags."
      />
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <Card>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <Field label="Category" htmlFor="category_id" error={errors.category_id?.message}>
                <NativeSelect
                  id="category_id"
                  {...register('category_id')}
                  aria-invalid={!!errors.category_id}
                >
                  <option value="">Pick a category...</option>
                  {(['it', 'facilities'] as const).map((group) => (
                    <optgroup key={group} label={CATEGORY_GROUP_LABELS[group]}>
                      {activeOr(categories.data)
                        .filter((c) => c.category_group === group)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.tag_prefix})
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Quantity" htmlFor="quantity" error={errors.quantity?.message}>
                <Input
                  id="quantity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={200}
                  {...register('quantity')}
                />
              </Field>
            </div>

            {category && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm">
                Will be tagged{' '}
                <span className="font-mono font-medium">
                  {tagPreview(category.tag_prefix, category.next_tag_number, quantity)}
                </span>
              </p>
            )}

            <Field
              label="Serial numbers"
              htmlFor="serials"
              error={errors.serials?.message}
              hint={
                serials.length
                  ? `${serials.length} serial${serials.length === 1 ? '' : 's'}${serials.length > typedQuantity ? ': the quantity follows the list' : ''}. The rest get none.`
                  : 'Optional. One per line, in tag order. Scanning them in with a barcode reader works.'
              }
            >
              <Textarea
                id="serials"
                rows={Math.min(Math.max(quantity, 2), 8)}
                className="font-mono"
                {...register('serials')}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <AssetFields
              register={register}
              make={make ?? ''}
              errors={errors}
              customFields={customFields}
              categoryId={category?.id ?? null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Department"
              htmlFor="department_id"
              hint="Who it serves. Leave Common if it is not for one department; issuing it sets this."
            >
              <NativeSelect id="department_id" {...register('department_id')}>
                <option value="">{COMMON} (no department)</option>
                {activeOr(departments.data).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label="Received on"
              htmlFor="received_date"
              error={errors.received_date?.message}
            >
              <Input id="received_date" type="date" {...register('received_date')} />
            </Field>
            <Field label="Reason / details" htmlFor="reason" hint="Goes on the Received (New) row.">
              <Input
                id="reason"
                placeholder="e.g. Bought for new joiners"
                {...register('reason')}
              />
            </Field>
          </CardContent>
        </Card>

        {(errors.root?.message || add.error) && (
          <Alert variant="destructive">
            <AlertDescription>{errors.root?.message ?? errorMessage(add.error)}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={add.isPending}>
            {add.isPending ? 'Adding...' : `Add ${quantity} asset${quantity === 1 ? '' : 's'}`}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to={fromTag ? `/assets/${fromTag}` : '/assets'}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
