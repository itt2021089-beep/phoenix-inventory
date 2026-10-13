import { useState } from 'react'

import { Field } from '@/components/Field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { activeOr, useDepartments, useLocations } from '@/features/lookups/useLookups'
import { COMMON } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { todayInColombo } from '@/lib/format'

import type { AssetDetail } from './api'
import { useEndOfLife, useMoveAsset } from './useAssetActions'

/** Move: where it sits and whom it serves. Starts from where it is now. */
export function MovePanel({ asset, onDone }: { asset: AssetDetail; onDone: () => void }) {
  const locations = useLocations()
  const departments = useDepartments()
  const move = useMoveAsset()
  const [locationId, setLocationId] = useState(asset.location_id ? String(asset.location_id) : '')
  const [departmentId, setDepartmentId] = useState(
    asset.department_id ? String(asset.department_id) : '',
  )
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(todayInColombo())
  const unchanged =
    locationId === (asset.location_id ? String(asset.location_id) : '') &&
    departmentId === (asset.department_id ? String(asset.department_id) : '')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Move {asset.asset_tag}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            move.mutate(
              {
                assetId: asset.id,
                locationId: locationId ? Number(locationId) : null,
                departmentId: departmentId ? Number(departmentId) : null,
                reason,
                date,
              },
              { onSuccess: onDone },
            )
          }}
        >
          <Field label="Location / desk" htmlFor="move-location">
            <NativeSelect
              id="move-location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              <option value="">No location</option>
              {activeOr(locations.data, asset.location_id).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Department" htmlFor="move-department">
            <NativeSelect
              id="move-department"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">{COMMON} (no department)</option>
              {activeOr(departments.data, asset.department_id).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Date" htmlFor="move-date">
            <Input
              id="move-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Reason / details" htmlFor="move-reason">
            <Input id="move-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {move.error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{errorMessage(move.error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={unchanged || move.isPending}>
              {move.isPending ? 'Saving...' : 'Move'}
            </Button>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/** Retire or Dispose: end of life, with a reason. Never a delete (CLAUDE.md, rule 4). */
export function EndOfLifePanel({
  asset,
  kind,
  onDone,
}: {
  asset: AssetDetail
  kind: 'retire' | 'dispose'
  onDone: () => void
}) {
  const end = useEndOfLife()
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(todayInColombo())
  const [sure, setSure] = useState(false)
  const verb = kind === 'retire' ? 'Retire' : 'Dispose'

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {verb} {asset.asset_tag}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            end.mutate({ kind, assetId: asset.id, reason, date }, { onSuccess: onDone })
          }}
        >
          <p className="text-sm text-muted-foreground">
            {kind === 'retire'
              ? 'Retired assets stay on record but leave the active counts.'
              : 'Disposed is final: the asset has left the company (e-waste, sold, scrapped).'}
            {asset.employee && ` It is taken off ${asset.employee.full_name}.`}
          </p>
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <Field label="Reason" htmlFor="eol-reason">
              <Input
                id="eol-reason"
                required
                placeholder={
                  kind === 'retire'
                    ? 'e.g. Battery dead, not worth repairing'
                    : 'e.g. Sent to e-waste'
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <Field label="Date" htmlFor="eol-date">
              <Input
                id="eol-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>
          {kind === 'dispose' && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={sure}
                onChange={(e) => setSure(e.target.checked)}
              />
              Yes, {asset.asset_tag} has gone for good
            </label>
          )}
          {end.error && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(end.error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button
              type="submit"
              variant={kind === 'dispose' ? 'destructive' : 'default'}
              disabled={!reason.trim() || (kind === 'dispose' && !sure) || end.isPending}
            >
              {end.isPending ? 'Saving...' : verb}
            </Button>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
