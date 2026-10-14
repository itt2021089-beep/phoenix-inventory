import type { FieldErrors, UseFormRegister } from 'react-hook-form'

import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { activeOr, useVendors } from '@/features/lookups/useLookups'
import { CONDITION_LABELS } from '@/lib/constants'
import type { CustomField } from '@/lib/db'

import { useMakesModels } from './api'
import type { AssetDetailsValues } from './assetForm'

// The fields Add and Edit share. Both forms' values include these keys.
type Shared = Omit<AssetDetailsValues, 'serial_number'>

/** Distinct, non-empty, sorted. */
const distinct = (xs: (string | null)[]) =>
  [...new Set(xs.map((x) => x?.trim()).filter((x): x is string => !!x))].sort((a, b) =>
    a.localeCompare(b),
  )

export function AssetFields({
  register,
  make: typedMake,
  errors,
  customFields,
  categoryId,
  supplierId,
}: {
  // Both forms are a superset of Shared; react-hook-form's generics can't express that, so
  // register is taken loosely and only ever called with Shared keys.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
  /** The make typed so far, to narrow the model suggestions. */
  make: string
  errors: FieldErrors<Shared>
  customFields: CustomField[]
  categoryId: number | null
  supplierId?: number | null
}) {
  const makesModels = useMakesModels()
  const vendors = useVendors()
  const make = typedMake.trim().toLowerCase()

  // Makes seen in this category first; models of the chosen make in this category.
  const inCategory = (makesModels.data ?? []).filter((r) => r.category_id === categoryId)
  const makes = distinct(
    (inCategory.length ? inCategory : (makesModels.data ?? [])).map((r) => r.make),
  )
  const models = distinct(
    inCategory.filter((r) => !make || r.make?.trim().toLowerCase() === make).map((r) => r.model),
  )

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Make" htmlFor="make" error={errors.make?.message}>
          <Input id="make" list="make-options" autoComplete="off" {...register('make')} />
          <datalist id="make-options">
            {makes.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <Field
          label="Model"
          htmlFor="model"
          error={errors.model?.message}
          hint="Leave blank if not known yet."
        >
          <Input id="model" list="model-options" autoComplete="off" {...register('model')} />
          <datalist id="model-options">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Condition" htmlFor="condition">
          <NativeSelect id="condition" {...register('condition')}>
            {Object.entries(CONDITION_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Specification" htmlFor="specification" hint="e.g. i5-7300U / 8GB / 256GB SSD">
          <Input id="specification" {...register('specification')} />
        </Field>
      </div>

      {customFields.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {customFields.map((f) => {
            const id = `custom-${f.key}`
            const label = f.required ? `${f.label} *` : f.label
            const reg = register(`custom_values.${f.key}`)
            return (
              <Field key={f.key} label={label} htmlFor={id}>
                {f.type === 'boolean' ? (
                  <NativeSelect id={id} {...reg}>
                    <option value="">Not set</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </NativeSelect>
                ) : f.type === 'select' ? (
                  <NativeSelect id={id} {...reg}>
                    <option value="">Not set</option>
                    {f.options?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input
                    id={id}
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    inputMode={f.type === 'number' ? 'decimal' : undefined}
                    {...reg}
                  />
                )}
              </Field>
            )
          })}
        </div>
      )}

      <Field
        label="Accessory details"
        htmlFor="accessories_note"
        hint='Details only, e.g. "Lenovo 65W". Accessories themselves are ticked when issuing.'
      >
        <Input id="accessories_note" {...register('accessories_note')} />
      </Field>

      <details className="rounded-lg border p-3 [&_summary]:cursor-pointer">
        <summary className="text-sm font-medium">Purchase and warranty</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field
            label="Purchase date"
            htmlFor="purchase_date"
            error={errors.purchase_date?.message}
          >
            <Input id="purchase_date" type="date" {...register('purchase_date')} />
          </Field>
          <Field
            label="Purchase price (LKR)"
            htmlFor="purchase_price"
            error={errors.purchase_price?.message}
          >
            <Input
              id="purchase_price"
              inputMode="decimal"
              placeholder="125000"
              {...register('purchase_price')}
            />
          </Field>
          <Field label="Supplier" htmlFor="supplier_id" hint="Add suppliers in Settings.">
            <NativeSelect id="supplier_id" {...register('supplier_id')}>
              <option value="">Not set</option>
              {activeOr(vendors.data, supplierId).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Invoice no" htmlFor="invoice_no">
            <Input id="invoice_no" {...register('invoice_no')} />
          </Field>
          <Field
            label="Warranty until"
            htmlFor="warranty_until"
            error={errors.warranty_until?.message}
          >
            <Input id="warranty_until" type="date" {...register('warranty_until')} />
          </Field>
        </div>
      </details>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" rows={2} {...register('notes')} />
      </Field>
    </div>
  )
}
