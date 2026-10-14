import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { Field } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/useAuth'
import { SwapPanel } from '@/features/assets/SwapPanel'
import { useAssetList } from '@/features/assets/api'
import { usePhotos } from '@/features/photos/api'
import { PhotoGallery } from '@/features/photos/PhotoGallery'
import { PhotoUpload } from '@/features/photos/PhotoUpload'
import { usePeople } from '@/features/people/api'
import { activeOr, useVendors } from '@/features/lookups/useLookups'
import { CONDITION_LABELS, FAULT_CAUSE_LABELS, FAULT_STATUS_LABELS, labelOf } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatDateTime, formatMoney, todayInColombo } from '@/lib/format'

import {
  type FaultRow,
  reporterName,
  useBackFromRepair,
  useFault,
  useMatchReporter,
  useSaveFinding,
  useSendForRepair,
  useUpdateFault,
} from './api'
import { FaultStatusBadge } from './FaultStatusBadge'
import { suggestPeople } from './filters'

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  )
}

export function FaultPage() {
  const { no } = useParams()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const fault = useFault(no)
  const f = fault.data
  // Which form was just saved. It lives here because saving refreshes the fault, which rebuilds
  // the forms, and a "Saved." kept inside a form would vanish with it.
  const [saved, setSaved] = useState<'repair' | 'finding' | null>(null)

  if (!f) {
    return (
      <>
        <PageHeader title={no} />
        <QueryState isLoading={fault.isLoading} error={fault.error} />
        {!fault.isLoading && !fault.error && (
          <p className="text-sm text-muted-foreground">
            No fault has the number {no}.{' '}
            <Link className="underline" to="/faults">
              Back to faults
            </Link>
          </p>
        )}
      </>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        to="/faults"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Faults
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{f.fault_no}</span>
            <FaultStatusBadge status={f.status} />
          </span>
        }
        description={f.description}
      />

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Detail label="Asset">
              {f.asset && (
                <span className="flex flex-wrap items-center gap-2">
                  <Link
                    className="font-mono underline underline-offset-2"
                    to={`/assets/${f.asset.asset_tag}`}
                  >
                    {f.asset.asset_tag}
                  </Link>
                  <StatusBadge status={f.asset.status} />
                </span>
              )}
            </Detail>
            <Detail label="What">
              {[f.asset?.category?.name, f.asset?.make, f.asset?.model].filter(Boolean).join(' · ')}
            </Detail>
            <Detail label="Reported">{formatDate(f.date_reported)}</Detail>
            <Detail label="Reported by">{reporterName(f)}</Detail>
            <Detail label="Held it at the time">{f.holder?.full_name ?? 'Nobody'}</Detail>
            <Detail label="Source">{f.source === 'qr' ? 'QR scan' : 'Entered by IT'}</Detail>
            <Detail label="Closed">{formatDate(f.date_closed)}</Detail>
            <Detail label="Logged">{formatDateTime(f.created_at)}</Detail>
          </dl>
        </CardContent>
      </Card>

      {isAdmin && f.source === 'qr' && !f.reported_by_employee_id && f.reported_by_name && (
        <MatchReporter fault={f} />
      )}

      {isAdmin ? (
        <FaultEditor
          key={`${f.id}-${f.updated_at}`}
          fault={f}
          saved={saved === 'repair'}
          setSaved={(v) => setSaved(v ? 'repair' : null)}
        />
      ) : (
        <FaultReadOnly fault={f} />
      )}

      {isAdmin && f.asset && f.status !== 'closed' && <RepairActions fault={f} />}
      {isAdmin && f.asset && !f.service_line_id && f.status !== 'closed' && (
        <p className="text-sm text-muted-foreground">
          Fixed as part of a bigger job?{' '}
          <Link
            className="underline underline-offset-2"
            to={`/service/new?asset=${f.asset.asset_tag}&fault=${f.fault_no}`}
          >
            Record it in a service job
          </Link>{' '}
          (the cost then goes on the job, not here).
        </p>
      )}

      <FaultPhotos fault={f} isAdmin={isAdmin} />

      {isAdmin ? (
        <Investigation
          key={`inv-${f.id}-${f.updated_at}`}
          fault={f}
          saved={saved === 'finding'}
          setSaved={(v) => setSaved(v ? 'finding' : null)}
        />
      ) : (
        <FindingReadOnly fault={f} />
      )}
    </div>
  )
}

function FaultReadOnly({ fault: f }: { fault: FaultRow }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Repair</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <Detail label="Status">{labelOf(FAULT_STATUS_LABELS, f.status)}</Detail>
          <Detail label="Action taken">{f.action_taken}</Detail>
          <Detail label="Vendor">{f.vendor?.name}</Detail>
          <Detail label="Cost">
            {f.service_line_id
              ? `On ${f.service_line?.job?.job_no ?? 'a service job'}`
              : formatMoney(f.cost)}
          </Detail>
          <Detail label="Under warranty">{f.under_warranty ? 'Yes' : 'No'}</Detail>
          <Detail label="Remarks">{f.remarks}</Detail>
        </dl>
      </CardContent>
    </Card>
  )
}

/** Status flow, vendor, cost and warranty. A fault fixed in a service job has its cost there. */
function FaultEditor({
  fault: f,
  saved,
  setSaved,
}: {
  fault: FaultRow
  saved: boolean
  setSaved: (saved: boolean) => void
}) {
  const vendors = useVendors()
  const update = useUpdateFault()
  const [status, setStatus] = useState(f.status)
  const [action, setAction] = useState(f.action_taken ?? '')
  const [vendorId, setVendorId] = useState(f.vendor_id ? String(f.vendor_id) : '')
  const [cost, setCost] = useState(f.cost ? String(f.cost) : '')
  const [warranty, setWarranty] = useState(f.under_warranty)
  const [closedOn, setClosedOn] = useState(f.date_closed ?? todayInColombo())
  const [remarks, setRemarks] = useState(f.remarks ?? '')
  const inService = f.service_line_id !== null
  const costNumber = cost.trim() === '' ? 0 : Number(cost)
  const badCost = !Number.isFinite(costNumber) || costNumber < 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Repair</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            setSaved(false)
            update.mutate(
              {
                id: f.id,
                changes: {
                  status,
                  action_taken: action.trim() || null,
                  vendor_id: vendorId ? Number(vendorId) : null,
                  cost: inService ? 0 : costNumber,
                  under_warranty: warranty,
                  date_closed: status === 'closed' ? closedOn : null,
                  remarks: remarks.trim() || null,
                },
              },
              { onSuccess: () => setSaved(true) },
            )
          }}
        >
          <Field label="Status" htmlFor="fault-status">
            <NativeSelect
              id="fault-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {Object.entries(FAULT_STATUS_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {status === 'closed' ? (
            <Field label="Date closed" htmlFor="fault-closed">
              <Input
                id="fault-closed"
                type="date"
                value={closedOn}
                onChange={(e) => setClosedOn(e.target.value)}
              />
            </Field>
          ) : (
            <div />
          )}
          <Field label="Action taken" htmlFor="fault-action" className="sm:col-span-2">
            <Input id="fault-action" value={action} onChange={(e) => setAction(e.target.value)} />
          </Field>
          <Field label="Vendor" htmlFor="fault-vendor">
            <NativeSelect
              id="fault-vendor"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              <option value="">No vendor</option>
              {activeOr(vendors.data, f.vendor_id).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Cost (LKR)"
            htmlFor="fault-cost"
            error={badCost ? 'Enter an amount of 0 or more.' : undefined}
            hint={
              inService ? (
                <>
                  Fixed in {f.service_line?.job?.job_no ?? 'a service job'}: the cost is on that
                  job&apos;s line ({formatMoney(f.service_line?.cost) || 'LKR 0'}), so it is not
                  counted twice.
                </>
              ) : undefined
            }
          >
            <Input
              id="fault-cost"
              inputMode="decimal"
              value={inService ? '0' : cost}
              disabled={inService}
              onChange={(e) => setCost(e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={warranty}
              onChange={(e) => setWarranty(e.target.checked)}
            />
            Under warranty
          </label>
          <Field label="Remarks" htmlFor="fault-remarks" className="sm:col-span-2">
            <Input
              id="fault-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </Field>
          {update.error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{errorMessage(update.error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={badCost || update.isPending}>
              {update.isPending ? 'Saving...' : 'Save'}
            </Button>
            {saved && !update.isPending && (
              <span role="status" className="text-sm text-muted-foreground">
                Saved.
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/** Send the asset to a vendor, or take it back. Each writes a Change Log row. */
function RepairActions({ fault: f }: { fault: FaultRow }) {
  const asset = f.asset!
  const vendors = useVendors()
  const send = useSendForRepair()
  const back = useBackFromRepair()
  const [vendorId, setVendorId] = useState(f.vendor_id ? String(f.vendor_id) : '')
  const [date, setDate] = useState(todayInColombo())
  const [reason, setReason] = useState('')
  const [condition, setCondition] = useState('good')
  const [fixed, setFixed] = useState(true)

  if (asset.status === 'under_repair') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Back from repair</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              back.mutate({
                assetId: f.asset_id,
                condition,
                nextStatus: fixed ? 'spare' : 'faulty',
                date,
                reason,
              })
            }}
          >
            <Field label="Condition now" htmlFor="back-condition">
              <NativeSelect
                id="back-condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
              >
                {Object.entries(CONDITION_LABELS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Date" htmlFor="back-date">
              <Input
                id="back-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={fixed} onChange={(e) => setFixed(e.target.checked)} />
              Fixed. It goes back to the spare pool and the fault closes. Untick if it came back
              unfixed.
            </label>
            <Field label="Reason / details" htmlFor="back-reason" className="sm:col-span-2">
              <Input id="back-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            {back.error && (
              <Alert variant="destructive" className="sm:col-span-2">
                <AlertDescription>{errorMessage(back.error)}</AlertDescription>
              </Alert>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={back.isPending}>
                {back.isPending ? 'Saving...' : 'Back from repair'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    )
  }

  if (asset.status === 'in_use') {
    return <InUseOptions fault={f} />
  }

  if (asset.status !== 'faulty' && asset.status !== 'spare') return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send for repair</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            send.mutate({
              assetId: f.asset_id,
              faultId: f.id,
              vendorId: vendorId ? Number(vendorId) : null,
              date,
              reason,
            })
          }}
        >
          <Field label="Vendor" htmlFor="send-vendor">
            <NativeSelect
              id="send-vendor"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              <option value="">Not sure yet</option>
              {activeOr(vendors.data, f.vendor_id).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Date" htmlFor="send-date">
            <Input
              id="send-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Reason / details" htmlFor="send-reason" className="sm:col-span-2">
            <Input id="send-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {send.error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{errorMessage(send.error)}</AlertDescription>
            </Alert>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={send.isPending}>
              {send.isPending ? 'Saving...' : 'Send for repair'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/** Sahan's finding after checking. Three separate facts: who told us, who held it, and this. */
function Investigation({
  fault: f,
  saved,
  setSaved,
}: {
  fault: FaultRow
  saved: boolean
  setSaved: (saved: boolean) => void
}) {
  const people = usePeople()
  const save = useSaveFinding()
  const [cause, setCause] = useState(f.cause ?? '')
  const [responsible, setResponsible] = useState(f.responsible_employee_id ?? '')
  const [notes, setNotes] = useState(f.finding_notes ?? '')
  // Active people, plus anyone already named (they may have left since).
  const choices = (people.data ?? []).filter(
    (p) => p.status === 'active' || p.id === f.responsible_employee_id,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Investigation</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            setSaved(false)
            save.mutate(
              {
                id: f.id,
                cause: cause || null,
                responsible_employee_id: responsible || null,
                finding_notes: notes.trim() || null,
              },
              { onSuccess: () => setSaved(true) },
            )
          }}
        >
          <Field label="Cause" htmlFor="finding-cause">
            <NativeSelect
              id="finding-cause"
              value={cause}
              onChange={(e) => setCause(e.target.value)}
            >
              <option value="">Not decided</option>
              {Object.entries(FAULT_CAUSE_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Responsible"
            htmlFor="finding-person"
            hint={
              f.holder
                ? `It was held by ${f.holder.full_name}; that is recorded separately.`
                : undefined
            }
          >
            <NativeSelect
              id="finding-person"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
            >
              <option value="">Nobody / not decided</option>
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Notes" htmlFor="finding-notes" className="sm:col-span-2">
            <Textarea
              id="finding-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          {save.error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{errorMessage(save.error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving...' : 'Save finding'}
            </Button>
            {saved && !save.isPending && (
              <span role="status" className="text-sm text-muted-foreground">
                Saved.
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function FindingReadOnly({ fault: f }: { fault: FaultRow }) {
  if (!f.cause && !f.responsible && !f.finding_notes) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Investigation</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <Detail label="Cause">{f.cause ? labelOf(FAULT_CAUSE_LABELS, f.cause) : ''}</Detail>
          <Detail label="Responsible">{f.responsible?.full_name}</Detail>
          <Detail label="Notes">{f.finding_notes}</Detail>
        </dl>
      </CardContent>
    </Card>
  )
}

/** Pictures of the damage, and (from Phase 3) the photo staff attach to a QR report. */
function FaultPhotos({ fault: f, isAdmin }: { fault: FaultRow; isAdmin: boolean }) {
  const photos = usePhotos('fault', String(f.id))
  if (!isAdmin && !photos.data?.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Photos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <PhotoGallery photos={photos.data ?? []} label="Fault photos" emptyText="No photos yet." />
        {isAdmin && (
          <PhotoUpload
            target={{
              entity: 'fault',
              entityId: String(f.id),
              folderKey: f.fault_no,
              kind: 'damage',
            }}
            label="Add photos of the damage"
          />
        )}
      </CardContent>
    </Card>
  )
}

/**
 * A QR report carries only the name typed on the phone. If it is someone in the register, one
 * click records who it was; the typed name stays on the fault. This is the reporter only: who
 * held the item and who was responsible are separate facts (CLAUDE.md, rule 8).
 */
function MatchReporter({ fault: f }: { fault: FaultRow }) {
  const people = usePeople()
  const match = useMatchReporter()
  const [other, setOther] = useState('')
  const suggestions = suggestPeople(f.reported_by_name ?? '', people.data ?? [])
  const active = (people.data ?? []).filter((p) => p.status === 'active')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who reported it?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          The staff member typed <span className="font-medium">{f.reported_by_name}</span>.
        </p>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="outline"
                size="sm"
                disabled={match.isPending}
                onClick={() => match.mutate({ id: f.id, employeeId: p.id })}
              >
                Yes, {p.full_name}
              </Button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Someone else" htmlFor="match-person" className="min-w-48 flex-1">
            <NativeSelect
              id="match-person"
              value={other}
              onChange={(e) => setOther(e.target.value)}
            >
              <option value="">Pick a person</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Button
            type="button"
            variant="outline"
            disabled={!other || match.isPending}
            onClick={() => match.mutate({ id: f.id, employeeId: other })}
          >
            Match
          </Button>
        </div>
        {match.error && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(match.error)}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

/** The faulty thing is still with its holder: return it, or swap in a spare in one step. */
function InUseOptions({ fault: f }: { fault: FaultRow }) {
  const assets = useAssetList()
  const [open, setOpen] = useState(false)
  const asset = f.asset!
  const full = assets.data?.find((x) => x.asset_tag === asset.asset_tag)

  if (open && full) {
    return (
      <SwapPanel
        asset={full}
        faultId={f.id}
        faultText={f.description}
        onDone={() => setOpen(false)}
      />
    )
  }
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p>
        {asset.asset_tag} is still with its holder.{' '}
        <Link className="underline underline-offset-2" to={`/return?asset=${asset.asset_tag}`}>
          Return it
        </Link>{' '}
        as Faulty, then send it for repair
        {full?.assigned_employee_id ? ', or give them a spare now:' : '.'}
      </p>
      {full?.assigned_employee_id && (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          Swap for a spare
        </Button>
      )}
    </div>
  )
}
