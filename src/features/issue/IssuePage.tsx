import { Plus, X } from 'lucide-react'
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
import { type AssetListRow, useAssetList } from '@/features/assets/api'
import { activeOr, useAccessoryTypes, useLocations } from '@/features/lookups/useLookups'
import { type PersonRow, usePeople } from '@/features/people/api'
import { useStockList } from '@/features/stock/api'
import { CONDITION_LABELS } from '@/lib/constants'
import type { Condition } from '@/lib/db'
import { errorMessage } from '@/lib/errors'
import { todayInColombo } from '@/lib/format'

import { AssetPicker } from './AssetPicker'
import { type IssueLine, issueItems, spareShortcuts, stockNeeded } from './handover'
import { attachConditionPhotos } from '@/features/photos/api'
import { PhotoPicker } from '@/features/photos/PhotoPicker'
import { MAX_CONDITION_PHOTOS } from '@/lib/photos'

import { HandoverDone } from './HandoverDone'
import { HandoverTabs } from './HandoverTabs'
import { PersonPicker } from './PersonPicker'
import { useIssue } from './useHandover'

/**
 * The accessories ticked last time for each category ("a laptop goes out with a charger and a
 * mouse"), kept in this browser only. A convenience: if storage is blocked, nothing is ticked.
 */
const ACCESSORY_MEMORY = 'phoenix.issue.accessoriesByCategory'

function rememberedAccessories(categoryId: number): number[] {
  try {
    const all = JSON.parse(localStorage.getItem(ACCESSORY_MEMORY) ?? '{}') as Record<
      string,
      unknown
    >
    const v = all[categoryId]
    return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : []
  } catch {
    return []
  }
}

function rememberAccessories(byCategory: Map<number, number[]>) {
  try {
    const all = JSON.parse(localStorage.getItem(ACCESSORY_MEMORY) ?? '{}') as Record<
      string,
      unknown
    >
    for (const [c, ids] of byCategory) all[c] = ids
    localStorage.setItem(ACCESSORY_MEMORY, JSON.stringify(all))
  } catch {
    // Storage blocked (private window): nothing to remember.
  }
}

/**
 * A picked asset starts with its current condition and the accessories already with it, or, if
 * it has none, the ones ticked last time for its category.
 */
const lineFor = (a: AssetListRow): IssueLine => {
  const withIt = a.asset_accessories.map((x) => x.accessory_type_id)
  return {
    assetId: a.id,
    condition: a.condition as Condition,
    accessoryTypeIds: withIt.length ? withIt : rememberedAccessories(a.category_id),
    photos: [],
  }
}

export function IssuePage() {
  const [params] = useSearchParams()
  const people = usePeople()
  const assets = useAssetList()
  if (!people.data || !assets.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <HandoverTabs />
        <PageHeader title="Issue" />
        <QueryState
          isLoading={people.isLoading || assets.isLoading}
          error={people.error ?? assets.error}
        />
      </div>
    )
  }
  return (
    <IssueForm
      people={people.data}
      assets={assets.data}
      startEmployeeId={params.get('employee')}
      startAssetTag={params.get('asset')}
      newJoiner={params.get('joiner') === '1'}
    />
  )
}

function IssueForm({
  people,
  assets,
  startEmployeeId,
  startAssetTag,
  newJoiner,
}: {
  people: PersonRow[]
  assets: AssetListRow[]
  startEmployeeId: string | null
  startAssetTag: string | null
  /** Arrived from "Save and issue devices" on a new person. */
  newJoiner: boolean
}) {
  const locations = useLocations()
  const accessoryTypes = useAccessoryTypes()
  const stock = useStockList()
  const issue = useIssue()

  const activePeople = people.filter((p) => p.status === 'active')
  const spares = assets.filter((a) => a.status === 'spare')
  const byId = new Map(assets.map((a) => [a.id, a]))

  // Arriving from a person (?employee=) or an asset (?asset=TAG) starts with them picked.
  const startPerson = activePeople.find((p) => p.id === startEmployeeId) ?? null
  const startAsset = spares.find((a) => a.asset_tag === startAssetTag)

  const [person, setPerson] = useState<PersonRow | null>(startPerson)
  const [lines, setLines] = useState<IssueLine[]>(startAsset ? [lineFor(startAsset)] : [])
  const [locationId, setLocationId] = useState(
    startPerson?.default_location_id ? String(startPerson.default_location_id) : '',
  )
  const [date, setDate] = useState(todayInColombo())
  const [reason, setReason] = useState(newJoiner ? 'New joiner' : '')
  const [makeForm, setMakeForm] = useState(true)
  const [showAllKinds, setShowAllKinds] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState<{
    formNo: string | null
    tags: string[]
    personId: string
    photoProblem: string | null
  } | null>(null)

  function choosePerson(p: PersonRow | null) {
    setPerson(p)
    // Their desk is where it goes, unless changed.
    setLocationId(p?.default_location_id ? String(p.default_location_id) : '')
  }

  const setLine = (i: number, patch: Partial<IssueLine>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  // Stock: how many each stock-linked accessory has left, and whether this issue needs more.
  const stockItemOf = (typeId: number) =>
    accessoryTypes.data?.find((t) => t.id === typeId)?.stock_item_id ?? null
  const stockById = new Map((stock.data ?? []).map((s) => [s.id, s]))
  const need = stockNeeded(
    lines.map((l) => ({
      accessoryTypeIds: l.accessoryTypeIds,
      alreadyWith: byId.get(l.assetId)?.asset_accessories.map((x) => x.accessory_type_id) ?? [],
    })),
    stockItemOf,
  )
  const shortages = [...need]
    .map(([id, n]) => ({ item: stockById.get(id), n }))
    .filter((x) => x.item && x.n > x.item.qty_on_hand)
  const issuedCount = new Map<number, number>()
  for (const a of assets)
    if (a.status === 'in_use' && a.assigned_employee_id)
      issuedCount.set(a.category_id, (issuedCount.get(a.category_id) ?? 0) + 1)
  const shortcuts = spareShortcuts(
    spares,
    lines.map((l) => l.assetId),
    issuedCount,
  )
  const shownShortcuts = showAllKinds
    ? shortcuts
    : shortcuts.filter((s) => !s.rarelyIssued || shortcuts.every((x) => x.rarelyIssued))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!person || !lines.length) return
    issue.mutate(
      {
        employeeId: person.id,
        items: issueItems(lines),
        locationId: locationId ? Number(locationId) : null,
        date,
        reason,
        makeForm,
      },
      {
        onSuccess: async (formNo) => {
          const byCategory = new Map<number, number[]>()
          for (const l of lines) {
            const c = byId.get(l.assetId)?.category_id
            if (c !== undefined) byCategory.set(c, l.accessoryTypeIds)
          }
          rememberAccessories(byCategory)
          // The issue is saved; the condition photos go up next, against its Change Log rows.
          setUploading(lines.some((l) => l.photos.length))
          const photoProblem = await attachConditionPhotos(
            lines.map((l) => ({ assetId: l.assetId, files: l.photos })),
            'issued',
          )
          setUploading(false)
          setDone({
            formNo,
            tags: lines.map((l) => byId.get(l.assetId)?.asset_tag ?? ''),
            personId: person.id,
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
          title={`Issued to ${person?.full_name}`}
          formNo={done.formNo}
          tags={done.tags}
          personId={done.personId}
          photoProblem={done.photoProblem}
          againLabel="Issue something else"
          onAgain={() => {
            setDone(null)
            setLines([])
            choosePerson(null)
            setReason('')
            issue.reset()
          }}
        />
      </>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <HandoverTabs />
      <PageHeader title="Issue" description="Give Spare assets to a person." />
      <form onSubmit={submit} className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>1. Who</CardTitle>
          </CardHeader>
          <CardContent>
            <PersonPicker
              id="issue-person"
              label="Person"
              people={activePeople}
              value={person}
              onChange={choosePerson}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. What</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <AssetPicker
              id="issue-asset"
              assets={spares}
              pickedIds={lines.map((l) => l.assetId)}
              onPick={(a) => setLines([...lines, lineFor(a)])}
            />
            {shortcuts.length > 0 && (
              <div className="flex flex-wrap gap-2" aria-label="Add the next spare of a kind">
                {shownShortcuts.map((s) => (
                  <Button
                    key={s.name}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setLines([...lines, lineFor(s.next)])}
                  >
                    <Plus aria-hidden />
                    {s.name}
                    <span className="text-muted-foreground">({s.count} spare)</span>
                  </Button>
                ))}
                {shownShortcuts.length < shortcuts.length && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllKinds(true)}
                  >
                    Other kinds ({shortcuts.length - shownShortcuts.length})
                  </Button>
                )}
              </div>
            )}
            {lines.map((l, i) => {
              const a = byId.get(l.assetId)
              return (
                <div key={l.assetId} className="grid gap-3 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono font-medium">{a?.asset_tag}</p>
                      <p className="text-sm text-muted-foreground">
                        {[a?.category?.name, a?.make, a?.model].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${a?.asset_tag}`}
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    >
                      <X />
                    </Button>
                  </div>
                  <Field label="Condition" htmlFor={`cond-${l.assetId}`}>
                    <NativeSelect
                      id={`cond-${l.assetId}`}
                      value={l.condition}
                      onChange={(e) => setLine(i, { condition: e.target.value as Condition })}
                    >
                      {Object.entries(CONDITION_LABELS).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <fieldset>
                    <legend className="mb-1 text-sm font-medium">Accessories given with it</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {activeOr(accessoryTypes.data).map((t) => (
                        <label key={t.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={l.accessoryTypeIds.includes(t.id)}
                            onChange={(e) =>
                              setLine(i, {
                                accessoryTypeIds: e.target.checked
                                  ? [...l.accessoryTypeIds, t.id]
                                  : l.accessoryTypeIds.filter((x) => x !== t.id),
                              })
                            }
                          />
                          {t.name}
                          {t.stock_item_id != null && stockById.get(t.stock_item_id) && (
                            <span
                              className={
                                stockById.get(t.stock_item_id)!.qty_on_hand === 0
                                  ? 'text-red-700 dark:text-red-400'
                                  : 'text-muted-foreground'
                              }
                            >
                              ({stockById.get(t.stock_item_id)!.qty_on_hand} left)
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div>
                    <p className="mb-1 text-sm font-medium">Condition photos</p>
                    <PhotoPicker
                      files={l.photos}
                      onChange={(photos) => setLine(i, { photos })}
                      max={MAX_CONDITION_PHOTOS}
                      label={`Add photos of ${a?.asset_tag}`}
                      disabled={issue.isPending || uploading}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Where and when</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Location / desk"
              htmlFor="issue-location"
              hint={
                person?.location ? `Their desk: ${person.location.name}` : 'They have no desk set.'
              }
            >
              <NativeSelect
                id="issue-location"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                <option value="">No location</option>
                {activeOr(locations.data, locationId ? Number(locationId) : null).map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Date" htmlFor="issue-date">
              <Input
                id="issue-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Reason / details" htmlFor="issue-reason" className="sm:col-span-2">
              <Input
                id="issue-reason"
                placeholder="e.g. New joiner"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="size-4"
                checked={makeForm}
                onChange={(e) => setMakeForm(e.target.checked)}
              />
              Make a handover form (HO number) to print and sign
            </label>
          </CardContent>
        </Card>

        {shortages.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              {shortages
                .map((x) => `${x.item!.name}: ${x.n} needed, ${x.item!.qty_on_hand} in stock.`)
                .join(' ')}{' '}
              Untick it on some items, or receive stock first.
            </AlertDescription>
          </Alert>
        )}
        {issue.error && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(issue.error)}</AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={
            !person ||
            !lines.length ||
            !date ||
            shortages.length > 0 ||
            issue.isPending ||
            uploading
          }
        >
          {uploading
            ? 'Saving photos...'
            : issue.isPending
              ? 'Saving...'
              : lines.length
                ? `Issue ${lines.length} item${lines.length === 1 ? '' : 's'}${person ? ` to ${person.full_name}` : ''}`
                : 'Pick a person and at least one asset'}
        </Button>
      </form>
    </div>
  )
}
