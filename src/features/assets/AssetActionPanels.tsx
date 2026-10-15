import { useState } from 'react'
import { Link } from 'react-router'

import { Field } from '@/components/Field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { activeOr, useAccessoryTypes, useDepartments } from '@/features/lookups/useLookups'
import { ASSET_STATUS_LABELS, COMMON, labelOf } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { todayInColombo } from '@/lib/format'

import { useOpenFault } from '@/features/faults/api'

import type { AssetDetail } from './api'
import {
  useChangeDepartment,
  useChangeStatus,
  useEndOfLife,
  useSetAccessories,
} from './useAssetActions'

/** Change department: for a shared item nobody holds (one someone holds follows them). */
export function DepartmentPanel({ asset, onDone }: { asset: AssetDetail; onDone: () => void }) {
  const departments = useDepartments()
  const change = useChangeDepartment()
  const current = asset.department_id ? String(asset.department_id) : ''
  const [departmentId, setDepartmentId] = useState(current)
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(todayInColombo())

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change the department of {asset.asset_tag}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            change.mutate(
              {
                assetId: asset.id,
                departmentId: departmentId ? Number(departmentId) : null,
                reason,
                date,
              },
              { onSuccess: onDone },
            )
          }}
        >
          <Field label="Department" htmlFor="dept-department">
            <NativeSelect
              id="dept-department"
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
          <Field label="Date" htmlFor="dept-date">
            <Input
              id="dept-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Reason / details" htmlFor="dept-reason" className="sm:col-span-2">
            <Input id="dept-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {change.error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{errorMessage(change.error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={departmentId === current || change.isPending}>
              {change.isPending ? 'Saving...' : 'Change department'}
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

/**
 * Change status: for Lost / Stolen (no other action sets it) or a status that is simply wrong.
 * Taking an item back from someone is Return; Retire and Dispose have their own actions.
 */
export function StatusPanel({ asset, onDone }: { asset: AssetDetail; onDone: () => void }) {
  const change = useChangeStatus()
  const held = !!asset.assigned_employee_id
  const choices = (['in_use', 'spare', 'faulty', 'under_repair', 'lost_stolen'] as const).filter(
    (s) => s !== asset.status && !(s === 'spare' && held),
  )
  const [status, setStatus] = useState<string>(choices[0] ?? '')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(todayInColombo())

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change the status of {asset.asset_tag}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            change.mutate({ assetId: asset.id, status, reason, date }, { onSuccess: onDone })
          }}
        >
          <Field
            label="New status"
            htmlFor="status-new"
            hint={
              held
                ? 'To take it back from its holder, use Return instead.'
                : 'Retire and Dispose are under More actions.'
            }
          >
            <NativeSelect
              id="status-new"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {choices.map((s) => (
                <option key={s} value={s}>
                  {labelOf(ASSET_STATUS_LABELS, s)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Date" htmlFor="status-date">
            <Input
              id="status-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Reason (required)" htmlFor="status-reason" className="sm:col-span-2">
            <Input
              id="status-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Left in a taxi on 12/10"
            />
          </Field>
          {change.error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{errorMessage(change.error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={!status || !reason.trim() || change.isPending}>
              {change.isPending ? 'Saving...' : 'Change status'}
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

/** Edit accessories: correct what is with an item (a wrong import, say). No stock moves. */
export function AccessoriesPanel({ asset, onDone }: { asset: AssetDetail; onDone: () => void }) {
  const types = useAccessoryTypes()
  const save = useSetAccessories()
  const [ticked, setTicked] = useState<number[]>(asset.accessories.map((x) => x.accessory_type_id))
  const sorted = (ids: number[]) => [...ids].sort((x, y) => x - y).join(',')
  const unchanged = sorted(ticked) === sorted(asset.accessories.map((x) => x.accessory_type_id))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accessories with {asset.asset_tag}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate({ assetId: asset.id, accessoryTypeIds: ticked }, { onSuccess: onDone })
          }}
        >
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {activeOr(types.data).map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={ticked.includes(t.id)}
                  onChange={(e) =>
                    setTicked(
                      e.target.checked ? [...ticked, t.id] : ticked.filter((x) => x !== t.id),
                    )
                  }
                />
                {t.name}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            A correction: stock does not change. If the stock count is wrong too, use Stock, then
            Adjust. Handing an accessory over or getting one back is part of Issue and Return.
          </p>
          {save.error && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(save.error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={unchanged || save.isPending}>
              {save.isPending ? 'Saving...' : 'Save accessories'}
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

/** Open a fault on this asset. Whoever holds it now is filled in by the database. */
export function OpenFaultPanel({ asset, onDone }: { asset: AssetDetail; onDone: () => void }) {
  const open = useOpenFault()
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayInColombo())
  const [opened, setOpened] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open a fault on {asset.asset_tag}</CardTitle>
      </CardHeader>
      <CardContent>
        {opened ? (
          <div className="space-y-3">
            <p role="status" className="text-sm">
              {opened} opened.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to={`/faults/${opened}`}>Open {opened}</Link>
              </Button>
              <Button variant="outline" onClick={onDone}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              open.mutate(
                { assetId: asset.id, description: description.trim(), date },
                { onSuccess: setOpened },
              )
            }}
          >
            <Field label="What's wrong" htmlFor="fault-description" className="sm:col-span-2">
              <Input
                id="fault-description"
                value={description}
                autoFocus
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <Field label="Date reported" htmlFor="fault-date">
              <Input
                id="fault-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            {asset.employee && (
              <p className="self-end text-sm text-muted-foreground">
                Held by {asset.employee.full_name} at the moment; that is recorded with the fault.
              </p>
            )}
            {open.error && (
              <Alert variant="destructive" className="sm:col-span-2">
                <AlertDescription>{errorMessage(open.error)}</AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={!description.trim() || open.isPending}>
                {open.isPending ? 'Saving...' : 'Open fault'}
              </Button>
              <Button type="button" variant="outline" onClick={onDone}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
