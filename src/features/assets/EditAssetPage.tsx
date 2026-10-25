import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'

import { Field } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useCategories } from '@/features/lookups/useLookups'
import { customFieldsOf } from '@/lib/db'
import { errorMessage } from '@/lib/errors'

import { useAsset } from './api'
import { AssetFields } from './AssetFields'
import {
  assetDetailsSchema,
  type AssetDetailsValues,
  customValuesToForm,
  missingRequired,
  toAssetUpdate,
} from './assetForm'
import { useUpdateAsset } from './useAssetActions'

export function EditAssetPage() {
  const { tag } = useParams()
  const navigate = useNavigate()
  // Opened from the Stock page: go back there after saving, not to the asset page.
  const backToStock = useSearchParams()[0].get('back') === 'stock'
  const asset = useAsset(tag)
  const categories = useCategories()
  const update = useUpdateAsset()

  const a = asset.data
  const category = categories.data?.find((c) => c.id === a?.category_id)
  const customFields = useMemo(() => customFieldsOf(category), [category])

  const { register, handleSubmit, control, reset, setError, formState } =
    useForm<AssetDetailsValues>({
      resolver: zodResolver(assetDetailsSchema),
    })
  const { errors, isDirty } = formState
  const make = useWatch({ control, name: 'make' })

  useEffect(() => {
    if (!a) return
    reset({
      make: a.make ?? '',
      model: a.model ?? '',
      serial_number: a.serial_number ?? '',
      condition: a.condition as AssetDetailsValues['condition'],
      specification: a.specification ?? '',
      accessories_note: a.accessories_note ?? '',
      purchase_date: a.purchase_date ?? '',
      purchase_price: a.purchase_price === null ? '' : String(a.purchase_price),
      supplier_id: a.supplier_id ? String(a.supplier_id) : '',
      invoice_no: a.invoice_no ?? '',
      warranty_until: a.warranty_until ?? '',
      notes: a.notes ?? '',
      custom_values: customValuesToForm(customFields, a.custom_values),
    })
  }, [a, customFields, reset])

  if (!a) {
    return (
      <>
        <PageHeader title={`Edit ${tag}`} />
        <QueryState isLoading={asset.isLoading} error={asset.error} />
      </>
    )
  }

  function onSubmit(values: AssetDetailsValues) {
    const missing = missingRequired(customFields, values.custom_values)
    if (missing.length) {
      setError('root', { message: `Fill in: ${missing.join(', ')}` })
      return
    }
    update.mutate(
      { assetId: a!.id, changes: toAssetUpdate(values, customFields) },
      { onSuccess: () => navigate(backToStock ? '/stock' : `/assets/${a!.asset_tag}`) },
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={
          <>
            Edit <span className="font-mono">{a.asset_tag}</span>
          </>
        }
        description="Details only. Status, person and department change through Issue, Return, Transfer and More actions on the asset page, so the Change Log always matches."
      />
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <Card>
          <CardContent className="grid gap-4">
            <Field
              label="Serial number"
              htmlFor="serial_number"
              error={errors.serial_number?.message}
            >
              <Input id="serial_number" className="font-mono" {...register('serial_number')} />
            </Field>
            <AssetFields
              register={register}
              make={make ?? ''}
              errors={errors}
              customFields={customFields}
              categoryId={a.category_id}
              supplierId={a.supplier_id}
            />
          </CardContent>
        </Card>
        {(errors.root?.message || update.error) && (
          <Alert variant="destructive">
            <AlertDescription>
              {errors.root?.message ?? errorMessage(update.error)}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={!isDirty || update.isPending}>
            {update.isPending ? 'Saving...' : 'Save'}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to={backToStock ? '/stock' : `/assets/${a.asset_tag}`}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
