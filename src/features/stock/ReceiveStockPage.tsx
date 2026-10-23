import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'
import type { z } from 'zod'

import { Field } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { assetKeys, useMakesModels } from '@/features/assets/api'
import {
  addAssetsSchema,
  type AddAssetsValues,
  duplicateSerials,
  effectiveQuantity,
  parseSerials,
  tagPreview,
  toAddAssetsArgs,
} from '@/features/assets/assetForm'
import { dashboardKeys } from '@/features/dashboard/useDashboard'
import { activeOr, lookupKeys, useCategories, useVendors } from '@/features/lookups/useLookups'
import { CATEGORY_GROUP_LABELS } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { formatDate, todayInColombo } from '@/lib/format'
import { supabase } from '@/lib/supabase'

import { stockKeys } from './api'
import { monthsBetween, serialSummary, warrantyUntil } from './receiveStock'

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
    purchase_date: todayInColombo(),
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

/** What the last delivery of a category looked like, to pre-fill the next one. */
function useLastDelivery(categoryId: number | null) {
  return useQuery({
    queryKey: [...assetKeys.all, 'last-delivery', categoryId] as const,
    enabled: categoryId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assets')
        .select('make, model, supplier_id, purchase_price, purchase_date, warranty_until')
        .eq('category_id', categoryId as number)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Receive a delivery into stock: details once, serials pasted in, every unit lands as Spare. */
export function ReceiveStockPage() {
  const categories = useCategories()
  const vendors = useVendors()
  const makesModels = useMakesModels()
  const queryClient = useQueryClient()
  const [created, setCreated] = useState<string[] | null>(null)
  const [months, setMonths] = useState('')

  const form = useForm<AddAssetsValues, unknown, Output>({
    resolver: zodResolver(addAssetsSchema),
    defaultValues: emptyValues(),
  })
  const { register, handleSubmit, control, setError, setValue, formState } = form
  const { errors } = formState

  const [categoryId, serialsText, quantityText, make, purchaseDate] = useWatch({
    control,
    name: ['category_id', 'serials', 'quantity', 'make', 'purchase_date'],
  })
  const category = categories.data?.find((c) => String(c.id) === categoryId)
  const serials = parseSerials(serialsText ?? '')
  const quantity = effectiveQuantity(Number(quantityText) || 1, serials)
  const dupes = duplicateSerials(serials)
  const warrantyEnd = warrantyUntil(purchaseDate ?? '', Number(months) || 0)

  // Pick a category and the last delivery's make, model, vendor, price and warranty fill in.
  const last = useLastDelivery(category?.id ?? null)
  const filledFor = useRef<string>('')
  useEffect(() => {
    if (!category || !last.data || filledFor.current === categoryId) return
    filledFor.current = categoryId
    setValue('make', last.data.make ?? '')
    setValue('model', last.data.model ?? '')
    setValue('supplier_id', last.data.supplier_id ? String(last.data.supplier_id) : '')
    setValue(
      'purchase_price',
      last.data.purchase_price === null ? '' : String(last.data.purchase_price),
    )
    const m = monthsBetween(last.data.purchase_date, last.data.warranty_until)
    setMonths(m ? String(m) : '')
  }, [category, categoryId, last.data, setValue])

  const known = (makesModels.data ?? []).filter((r) => r.category_id === category?.id)
  const makeOptions = [...new Set(known.map((r) => r.make).filter((x): x is string => !!x))]
  const modelOptions = [
    ...new Set(
      known
        .filter((r) => !make || r.make === make)
        .map((r) => r.model)
        .filter((x): x is string => !!x),
    ),
  ]

  const receive = useMutation({
    mutationFn: async (values: Output) => {
      // The delivery date is both the purchase date and the day it was received.
      const withDates: Output = {
        ...values,
        received_date: values.purchase_date || values.received_date,
        warranty_until: warrantyUntil(values.purchase_date, Number(months) || 0),
      }
      const { data, error } = await supabase.rpc('add_assets', toAddAssetsArgs(withDates, []))
      if (error) throw error
      return data
    },
    onSuccess: (tags) => {
      setCreated(tags)
      void queryClient.invalidateQueries({ queryKey: assetKeys.all })
      void queryClient.invalidateQueries({ queryKey: stockKeys.all })
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
      void queryClient.invalidateQueries({ queryKey: lookupKeys.categories })
    },
  })

  function onSubmit(values: Output) {
    if (dupes.length) {
      setError('serials', { message: `Listed twice: ${dupes.join(', ')}` })
      return
    }
    receive.mutate(values)
  }

  if (created) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Stock received" />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-green-600" />
              {created.length} new item{created.length === 1 ? '' : 's'} in stock
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
              Each one is Spare, with a Received (New) row in its Change Log.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to={`/print/labels?tags=${encodeURIComponent(created.join(','))}`}>
                  Print QR labels
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setValue('serials', '')
                  setValue('quantity', '1')
                  setCreated(null)
                  receive.reset()
                }}
              >
                Receive another delivery
              </Button>
              <Button variant="outline" asChild>
                <Link to="/stock">Back to stock</Link>
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
        title="Receive stock"
        description="One delivery: enter the details once, paste the serial numbers. Each unit gets its own tag and starts as Spare."
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
                  ? `${serialSummary(serials.length, quantity)}${serials.length > (Number(quantityText) || 1) ? '. The quantity follows the list.' : '.'}`
                  : 'One per line, in tag order. A barcode reader can scan them straight in.'
              }
            >
              <Textarea
                id="serials"
                rows={Math.min(Math.max(quantity, 3), 10)}
                className="font-mono"
                {...register('serials')}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Make" htmlFor="make" error={errors.make?.message}>
              <Input
                id="make"
                list="receive-make-options"
                autoComplete="off"
                {...register('make')}
              />
              <datalist id="receive-make-options">
                {makeOptions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
            <Field label="Model" htmlFor="model" error={errors.model?.message}>
              <Input
                id="model"
                list="receive-model-options"
                autoComplete="off"
                {...register('model')}
              />
              <datalist id="receive-model-options">
                {modelOptions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
            <Field label="Vendor" htmlFor="supplier_id">
              <NativeSelect id="supplier_id" {...register('supplier_id')}>
                <option value="">Pick a vendor...</option>
                {activeOr(vendors.data).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Invoice no" htmlFor="invoice_no">
              <Input id="invoice_no" autoComplete="off" {...register('invoice_no')} />
            </Field>
            <Field
              label="Delivery date"
              htmlFor="purchase_date"
              error={errors.purchase_date?.message}
            >
              <Input id="purchase_date" type="date" {...register('purchase_date')} />
            </Field>
            <Field
              label="Price each (LKR)"
              htmlFor="purchase_price"
              error={errors.purchase_price?.message}
            >
              <Input
                id="purchase_price"
                inputMode="decimal"
                autoComplete="off"
                {...register('purchase_price')}
              />
            </Field>
            <Field
              label="Warranty (months)"
              htmlFor="warranty_months"
              hint={warrantyEnd ? `Ends ${formatDate(warrantyEnd)}` : 'Leave blank if none.'}
            >
              <Input
                id="warranty_months"
                type="number"
                inputMode="numeric"
                min={0}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        {(errors.root?.message || receive.error) && (
          <Alert variant="destructive">
            <AlertDescription>
              {errors.root?.message ?? errorMessage(receive.error)}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={receive.isPending}>
            {receive.isPending ? 'Receiving...' : `Receive ${quantity} into stock`}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to="/stock">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
