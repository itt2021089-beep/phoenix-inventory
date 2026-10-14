import { X } from 'lucide-react'
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
import { CONDITION_LABELS } from '@/lib/constants'
import type { Condition } from '@/lib/db'
import { errorMessage } from '@/lib/errors'
import { todayInColombo } from '@/lib/format'

import { AssetPicker } from './AssetPicker'
import { type IssueLine, issueItems } from './handover'
import { attachConditionPhotos } from '@/features/photos/api'
import { PhotoPicker } from '@/features/photos/PhotoPicker'
import { MAX_CONDITION_PHOTOS } from '@/lib/photos'

import { HandoverDone } from './HandoverDone'
import { HandoverTabs } from './HandoverTabs'
import { PersonPicker } from './PersonPicker'
import { useIssue } from './useHandover'

/** A picked asset starts with its current condition and the accessories already with it. */
const lineFor = (a: AssetListRow): IssueLine => ({
  assetId: a.id,
  condition: a.condition as Condition,
  accessoryTypeIds: a.asset_accessories.map((x) => x.accessory_type_id),
  photos: [],
})

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
    />
  )
}

function IssueForm({
  people,
  assets,
  startEmployeeId,
  startAssetTag,
}: {
  people: PersonRow[]
  assets: AssetListRow[]
  startEmployeeId: string | null
  startAssetTag: string | null
}) {
  const locations = useLocations()
  const accessoryTypes = useAccessoryTypes()
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
  const [reason, setReason] = useState('')
  const [makeForm, setMakeForm] = useState(true)
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

        {issue.error && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(issue.error)}</AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={!person || !lines.length || !date || issue.isPending || uploading}
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
