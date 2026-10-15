import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { Field } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { type AssetListRow, useAssetList } from '@/features/assets/api'
import { activeOr, useLocations } from '@/features/lookups/useLookups'
import {
  heldCount,
  type Holding,
  type PersonRow,
  useHoldings,
  usePeople,
} from '@/features/people/api'
import { CONDITION_LABELS } from '@/lib/constants'
import type { Condition } from '@/lib/db'
import { errorMessage } from '@/lib/errors'
import { todayInColombo } from '@/lib/format'

import {
  missingSummary,
  type NextStatus,
  overallReturnCondition,
  type ReturnCondition,
  type ReturnLine,
  returnItems,
} from './handover'
import { attachConditionPhotos } from '@/features/photos/api'
import { PhotoPicker } from '@/features/photos/PhotoPicker'
import { MAX_CONDITION_PHOTOS } from '@/lib/photos'

import { HandoverDone } from './HandoverDone'
import { HandoverTabs } from './HandoverTabs'
import { PersonPicker } from './PersonPicker'
import { useReturn } from './useHandover'

const NEXT_STATUS_LABELS: Record<NextStatus, string> = {
  spare: 'Spare (ready to issue again)',
  under_repair: 'Under Repair',
  faulty: 'Faulty',
}
const RETURN_CONDITION_LABELS: Record<ReturnCondition, string> = {
  good: 'Good',
  damaged: 'Damaged',
  items_missing: 'Items missing',
}

/** A returned item starts as: same condition, every accessory back, Spare. */
const lineFor = (h: {
  id: string
  condition: string
  accessories: { accessory_type_id: number }[]
}): ReturnLine => ({
  assetId: h.id,
  condition: h.condition as Condition,
  accessories: Object.fromEntries(h.accessories.map((a) => [a.accessory_type_id, true])),
  nextStatus: 'spare',
  faultDescription: '',
  photos: [],
})

export function ReturnPage() {
  const [params] = useSearchParams()
  const people = usePeople()
  const assets = useAssetList()
  if (!people.data || !assets.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <HandoverTabs />
        <PageHeader title="Return" />
        <QueryState
          isLoading={people.isLoading || assets.isLoading}
          error={people.error ?? assets.error}
        />
      </div>
    )
  }
  const startAsset = assets.data.find(
    (a) => a.asset_tag === params.get('asset') && a.status === 'in_use',
  )
  const startPersonId = startAsset?.assigned_employee_id ?? params.get('employee')
  return (
    <ReturnForm
      // A new start (another person or asset in the URL) gets a fresh form. The key comes from
      // the URL only: once the return is saved the asset is no longer In Use, and a key built
      // from it would reset the form and lose the "Returned" screen.
      key={`${params.get('employee')}-${params.get('asset')}`}
      people={people.data}
      startPerson={people.data.find((p) => p.id === startPersonId) ?? null}
      startAsset={startAsset}
      tickAll={params.get('all') === '1'}
    />
  )
}

function ReturnForm({
  people,
  startPerson,
  startAsset,
  tickAll,
}: {
  people: PersonRow[]
  startPerson: PersonRow | null
  startAsset: AssetListRow | undefined
  tickAll: boolean
}) {
  const locations = useLocations()
  const ret = useReturn()
  const [person, setPerson] = useState<PersonRow | null>(startPerson)
  const holdings = useHoldings(person?.id)
  // An In Use asset with no holder (a shared printer, say) is returned on its own, without a form.
  const unheld = !startPerson && startAsset ? startAsset : undefined

  const [lines, setLines] = useState<ReturnLine[] | null>(
    unheld
      ? [
          lineFor({
            id: unheld.id,
            condition: unheld.condition,
            accessories: unheld.asset_accessories,
          }),
        ]
      : startAsset
        ? [
            lineFor({
              id: startAsset.id,
              condition: startAsset.condition,
              accessories: startAsset.asset_accessories,
            }),
          ]
        : null,
  )
  const [conditionOverride, setConditionOverride] = useState<ReturnCondition | null>(null)
  const [dataBackedUp, setDataBackedUp] = useState('')
  const [remarks, setRemarks] = useState('')
  const store = locations.data?.find((l) => l.kind === 'store' && l.is_active)
  const [locationId, setLocationId] = useState<string | null>(null)
  const [date, setDate] = useState(todayInColombo())
  const [makeForm, setMakeForm] = useState(!unheld)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState<{
    formNo: string | null
    tags: string[]
    photoProblem: string | null
  } | null>(null)

  const held: Holding[] = unheld
    ? [
        {
          id: unheld.id,
          asset_tag: unheld.asset_tag,
          make: unheld.make,
          model: unheld.model,
          serial_number: unheld.serial_number,
          condition: unheld.condition,
          date_assigned: unheld.date_assigned,
          category: unheld.category,
          location: unheld.location,
          accessories: unheld.asset_accessories,
        },
      ]
    : (holdings.data ?? [])
  // "Return everything" (?all=1) ticks every item once their holdings arrive.
  const picked: ReturnLine[] = lines ?? (tickAll && holdings.data ? holdings.data.map(lineFor) : [])
  const byId = new Map(held.map((h) => [h.id, h]))
  const accessoryName = (id: number) =>
    held.flatMap((h) => h.accessories).find((a) => a.accessory_type_id === id)?.accessory_types
      ?.name ?? '?'
  const autoCondition = overallReturnCondition(picked)
  const returnCondition = conditionOverride ?? autoCondition
  const missing = missingSummary(picked, (id) => byId.get(id)?.asset_tag ?? '', accessoryName)
  const effectiveLocation = locationId ?? (store ? String(store.id) : '')

  const setLine = (assetId: string, patch: Partial<ReturnLine>) =>
    setLines(picked.map((l) => (l.assetId === assetId ? { ...l, ...patch } : l)))
  const toggle = (h: Holding, on: boolean) =>
    setLines(on ? [...picked, lineFor(h)] : picked.filter((l) => l.assetId !== h.id))

  function choosePerson(p: PersonRow | null) {
    setPerson(p)
    setLines([])
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!picked.length) return
    ret.mutate(
      {
        items: returnItems(picked),
        returnCondition,
        dataBackedUp,
        remarks: [remarks.trim(), missing].filter(Boolean).join('. '),
        makeForm: makeForm && !!person,
        date,
        locationId: effectiveLocation ? Number(effectiveLocation) : null,
      },
      {
        onSuccess: async (formNo) => {
          // The return is saved; the condition photos go up next, against its Change Log rows.
          setUploading(picked.some((l) => l.photos.length))
          const photoProblem = await attachConditionPhotos(
            picked.map((l) => ({ assetId: l.assetId, files: l.photos })),
            'returned',
          )
          setUploading(false)
          setDone({
            formNo,
            tags: picked.map((l) => byId.get(l.assetId)?.asset_tag ?? ''),
            photoProblem,
          })
        },
      },
    )
  }

  if (done) {
    return (
      <>
        <HandoverTabs />
        <HandoverDone
          title={person ? `Returned from ${person.full_name}` : 'Returned'}
          formNo={done.formNo}
          tags={done.tags}
          photoProblem={done.photoProblem}
          personId={person?.id}
          againLabel="Return something else"
          onAgain={() => {
            setDone(null)
            choosePerson(null)
            setRemarks('')
            setConditionOverride(null)
            ret.reset()
          }}
        />
      </>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <HandoverTabs />
      <PageHeader title="Return" description="Take items back to IT." />
      <form onSubmit={submit} className="grid gap-4">
        {!unheld && (
          <Card>
            <CardHeader>
              <CardTitle>1. From whom</CardTitle>
            </CardHeader>
            <CardContent>
              <PersonPicker
                id="return-person"
                label="Person"
                people={people.filter((p) => heldCount(p) > 0)}
                value={person}
                onChange={choosePerson}
                emptyText="Nobody who holds anything matches."
              />
            </CardContent>
          </Card>
        )}

        {(person || unheld) && (
          <Card>
            <CardHeader>
              <CardTitle>{unheld ? 'Item' : '2. What comes back'}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <QueryState isLoading={!unheld && holdings.isLoading} error={holdings.error} />
              {!unheld && held.length > 1 && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setLines(held.map(lineFor))}
                  >
                    Tick all
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setLines([])}>
                    Clear
                  </Button>
                </div>
              )}
              {held.map((h) => {
                const l = picked.find((x) => x.assetId === h.id)
                return (
                  <div key={h.id} className="grid gap-3 rounded-lg border p-3">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-4"
                        checked={!!l}
                        disabled={!!unheld}
                        onChange={(e) => toggle(h, e.target.checked)}
                      />
                      <span>
                        <span className="font-mono font-medium">{h.asset_tag}</span>
                        <span className="block text-sm text-muted-foreground">
                          {[h.category?.name, h.make, h.model].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </label>
                    {l && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Condition now" htmlFor={`rc-${h.id}`}>
                          <NativeSelect
                            id={`rc-${h.id}`}
                            value={l.condition}
                            onChange={(e) =>
                              setLine(h.id, { condition: e.target.value as Condition })
                            }
                          >
                            {Object.entries(CONDITION_LABELS).map(([v, label]) => (
                              <option key={v} value={v}>
                                {label}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                        <Field label="Goes to" htmlFor={`ns-${h.id}`}>
                          <NativeSelect
                            id={`ns-${h.id}`}
                            value={l.nextStatus}
                            onChange={(e) =>
                              setLine(h.id, { nextStatus: e.target.value as NextStatus })
                            }
                          >
                            {Object.entries(NEXT_STATUS_LABELS).map(([v, label]) => (
                              <option key={v} value={v}>
                                {label}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                        {h.accessories.length > 0 && (
                          <fieldset className="sm:col-span-2">
                            <legend className="mb-1 text-sm font-medium">Accessories</legend>
                            <div className="grid gap-1">
                              {h.accessories.map((a) => {
                                const back = l.accessories[a.accessory_type_id] !== false
                                return (
                                  <div
                                    key={a.accessory_type_id}
                                    className="flex items-center gap-3 text-sm"
                                  >
                                    <span className="w-24">{a.accessory_types?.name}</span>
                                    {(['returned', 'missing'] as const).map((choice) => (
                                      <label key={choice} className="flex items-center gap-1">
                                        <input
                                          type="radio"
                                          name={`acc-${h.id}-${a.accessory_type_id}`}
                                          checked={choice === 'returned' ? back : !back}
                                          onChange={() =>
                                            setLine(h.id, {
                                              accessories: {
                                                ...l.accessories,
                                                [a.accessory_type_id]: choice === 'returned',
                                              },
                                            })
                                          }
                                        />
                                        {choice === 'returned' ? 'Returned' : 'Missing'}
                                      </label>
                                    ))}
                                  </div>
                                )
                              })}
                            </div>
                          </fieldset>
                        )}
                        {l.nextStatus !== 'spare' && (
                          <Field
                            label="What's wrong"
                            htmlFor={`fd-${h.id}`}
                            className="sm:col-span-2"
                            hint={
                              l.faultDescription.trim()
                                ? 'Opens a fault (FLT-) on this asset, with the person returning it as the reporter.'
                                : 'Left blank, no fault is logged. Fill it in unless a fault is already open for this item.'
                            }
                          >
                            <Input
                              id={`fd-${h.id}`}
                              value={l.faultDescription}
                              onChange={(e) => setLine(h.id, { faultDescription: e.target.value })}
                            />
                          </Field>
                        )}
                        <div className="sm:col-span-2">
                          <p className="mb-1 text-sm font-medium">Condition photos</p>
                          <PhotoPicker
                            files={l.photos}
                            onChange={(photos) => setLine(h.id, { photos })}
                            max={MAX_CONDITION_PHOTOS}
                            label={`Add photos of ${h.asset_tag}`}
                            disabled={ret.isPending || uploading}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {!unheld && holdings.data && held.length === 0 && (
                <p className="text-sm text-muted-foreground">They hold nothing.</p>
              )}
            </CardContent>
          </Card>
        )}

        {picked.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{unheld ? 'Details' : '3. On return (IT use)'}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Condition on return"
                htmlFor="return-condition"
                hint={conditionOverride ? undefined : 'Worked out from the items above.'}
              >
                <NativeSelect
                  id="return-condition"
                  value={returnCondition}
                  onChange={(e) => setConditionOverride(e.target.value as ReturnCondition)}
                >
                  {Object.entries(RETURN_CONDITION_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Data backed up / device reset" htmlFor="data-backed-up">
                <NativeSelect
                  id="data-backed-up"
                  value={dataBackedUp}
                  onChange={(e) => setDataBackedUp(e.target.value)}
                >
                  <option value="">Not recorded</option>
                  <option value="yes">Yes</option>
                  <option value="not_needed">Not needed</option>
                </NativeSelect>
              </Field>
              <Field label="Back to" htmlFor="return-location">
                <NativeSelect
                  id="return-location"
                  value={effectiveLocation}
                  onChange={(e) => setLocationId(e.target.value)}
                >
                  {activeOr(locations.data).map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Date" htmlFor="return-date">
                <Input
                  id="return-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Field
                label="Remarks / missing items"
                htmlFor="return-remarks"
                className="sm:col-span-2"
                hint={missing || undefined}
              >
                <Textarea
                  id="return-remarks"
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </Field>
              {person && (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={makeForm}
                    onChange={(e) => setMakeForm(e.target.checked)}
                  />
                  Make a handover form (HO number) to print and sign
                </label>
              )}
            </CardContent>
          </Card>
        )}

        {ret.error && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(ret.error)}</AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={!picked.length || !date || ret.isPending || uploading}
        >
          {uploading
            ? 'Saving photos...'
            : ret.isPending
              ? 'Saving...'
              : picked.length
                ? `Return ${picked.length} item${picked.length === 1 ? '' : 's'}`
                : 'Tick what comes back'}
        </Button>
      </form>
    </div>
  )
}
