import { ArrowLeft, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

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
import { type FaultRow, useFaults } from '@/features/faults/api'
import { activeOr, useCategories, useLocations, useVendors } from '@/features/lookups/useLookups'
import { SERVICE_JOB_TYPE_LABELS } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatMoney, todayInColombo } from '@/lib/format'

import { useRecordServiceJob } from './api'
import {
  invoiceMismatch,
  lineTotal,
  nextDueFrom,
  type ServiceHeaderDraft,
  type ServiceLineDraft,
  validateJob,
} from './serviceForm'

let keyCounter = 0
const newKey = () => `line-${++keyCounter}`

const isActive = (a: AssetListRow) => a.status !== 'retired' && a.status !== 'disposed'

/**
 * One job, one line per asset ("cleaned and repaired the HR, CEO and Sales room ACs").
 * Built to save typing: add a whole category or room in one tap, type the work done once, and
 * the next due date fills itself in from the category's interval.
 */
export function NewServiceJobPage() {
  const [params] = useSearchParams()
  const assets = useAssetList()
  const faults = useFaults()

  if (!assets.data || !faults.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="New service job" />
        <QueryState
          isLoading={assets.isLoading || faults.isLoading}
          error={assets.error ?? faults.error}
        />
      </div>
    )
  }

  // Arriving from a fault ("Record it in a service job") or an asset: start with that line.
  const asset = assets.data.find((a) => a.asset_tag === params.get('asset'))
  const fault = faults.data.find((f) => f.fault_no === params.get('fault'))
  const initialLines: ServiceLineDraft[] = asset
    ? [
        {
          key: newKey(),
          assetId: asset.id,
          workDone: '',
          cost: '',
          nextDue: '',
          faultId: fault && fault.asset_id === asset.id ? fault.id : null,
        },
      ]
    : []

  return <ServiceJobForm assets={assets.data} faults={faults.data} initialLines={initialLines} />
}

function ServiceJobForm({
  assets,
  faults,
  initialLines,
}: {
  assets: AssetListRow[]
  faults: FaultRow[]
  initialLines: ServiceLineDraft[]
}) {
  const navigate = useNavigate()
  const categories = useCategories()
  const locations = useLocations()
  const vendors = useVendors()
  const record = useRecordServiceJob()

  const [header, setHeader] = useState<ServiceHeaderDraft>({
    vendorId: '',
    jobType: 'cleaning',
    serviceDate: todayInColombo(),
    invoiceNo: '',
    invoiceTotal: '',
    notes: '',
  })
  const [lines, setLines] = useState<ServiceLineDraft[]>(initialLines)
  const [defaultWork, setDefaultWork] = useState('')
  const [defaultCost, setDefaultCost] = useState('')
  const [pickCategory, setPickCategory] = useState('')
  const [pickLocation, setPickLocation] = useState('')
  const [search, setSearch] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])
  const openFaults = useMemo(
    () => faults.filter((f) => f.status !== 'closed' && !f.service_line_id),
    [faults],
  )

  function lineFor(asset: AssetListRow, faultId: number | null = null): ServiceLineDraft {
    return {
      key: newKey(),
      assetId: asset.id,
      workDone: defaultWork,
      cost: defaultCost,
      nextDue: '',
      faultId,
    }
  }

  function addAssets(toAdd: AssetListRow[]) {
    setLines((cur) => {
      const have = new Set(cur.map((l) => l.assetId))
      return [...cur, ...toAdd.filter((a) => !have.has(a.id)).map((a) => lineFor(a))]
    })
  }

  const candidates = assets.filter(
    (a) =>
      isActive(a) &&
      (!pickCategory || String(a.category_id) === pickCategory) &&
      (!pickLocation || String(a.location_id) === pickLocation),
  )
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = search
    ? assets
        .filter(
          (a) =>
            isActive(a) &&
            !lines.some((l) => l.assetId === a.id) &&
            words.every((w) =>
              [a.asset_tag, a.serial_number, a.make, a.model, a.category?.name, a.location?.name]
                .join(' ')
                .toLowerCase()
                .includes(w),
            ),
        )
        .slice(0, 8)
    : []

  const mismatch = invoiceMismatch(lines, header.invoiceTotal)
  const total = lineTotal(lines)
  const setH = (patch: Partial<ServiceHeaderDraft>) => setHeader((h) => ({ ...h, ...patch }))
  const setLine = (key: string, patch: Partial<ServiceLineDraft>) =>
    setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  function submit() {
    const problem = validateJob(header, lines)
    setFormError(problem)
    if (problem) return
    record.mutate({ header, lines }, { onSuccess: (jobNo) => navigate(`/service/${jobNo}`) })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        to="/service"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Service jobs
      </Link>
      <PageHeader
        title="New service job"
        description="One job, one line per asset. The cost of each line goes on that line."
      />

      <Card>
        <CardHeader>
          <CardTitle>1. The job</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Vendor" htmlFor="job-vendor">
            <NativeSelect
              id="job-vendor"
              value={header.vendorId}
              onChange={(e) => setH({ vendorId: e.target.value })}
            >
              <option value="">No vendor (done in-house)</option>
              {activeOr(vendors.data, header.vendorId ? Number(header.vendorId) : null).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Type" htmlFor="job-type">
            <NativeSelect
              id="job-type"
              value={header.jobType}
              onChange={(e) => setH({ jobType: e.target.value })}
            >
              {Object.entries(SERVICE_JOB_TYPE_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Date" htmlFor="job-date">
            <Input
              id="job-date"
              type="date"
              value={header.serviceDate}
              onChange={(e) => setH({ serviceDate: e.target.value })}
            />
          </Field>
          <Field label="Invoice no" htmlFor="job-invoice">
            <Input
              id="job-invoice"
              value={header.invoiceNo}
              onChange={(e) => setH({ invoiceNo: e.target.value })}
            />
          </Field>
          <Field
            label="Invoice total (LKR)"
            htmlFor="job-total"
            hint="As printed on the invoice. Optional; used to check the lines add up."
          >
            <Input
              id="job-total"
              inputMode="decimal"
              value={header.invoiceTotal}
              onChange={(e) => setH({ invoiceTotal: e.target.value })}
            />
          </Field>
          <Field label="Notes" htmlFor="job-notes">
            <Textarea
              id="job-notes"
              rows={2}
              value={header.notes}
              onChange={(e) => setH({ notes: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. What was done to which assets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
            <Field label="Work done (for lines you add)" htmlFor="default-work">
              <Input
                id="default-work"
                placeholder="e.g. Cleaned and gas checked"
                value={defaultWork}
                onChange={(e) => setDefaultWork(e.target.value)}
              />
            </Field>
            <Field label="Cost each (LKR)" htmlFor="default-cost">
              <Input
                id="default-cost"
                inputMode="decimal"
                value={defaultCost}
                onChange={(e) => setDefaultCost(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!lines.length || (!defaultWork && !defaultCost)}
                onClick={() =>
                  setLines((cur) =>
                    cur.map((l) => ({
                      ...l,
                      workDone: defaultWork || l.workDone,
                      cost: defaultCost || l.cost,
                    })),
                  )
                }
              >
                Apply to all {lines.length} lines
              </Button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <NativeSelect
              aria-label="Category"
              value={pickCategory}
              onChange={(e) => setPickCategory(e.target.value)}
            >
              <option value="">Any category</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Location"
              value={pickLocation}
              onChange={(e) => setPickLocation(e.target.value)}
            >
              <option value="">Any room</option>
              {activeOr(locations.data).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
            <Button
              type="button"
              variant="outline"
              disabled={(!pickCategory && !pickLocation) || candidates.length === 0}
              onClick={() => addAssets(candidates)}
            >
              <Plus /> Add all {pickCategory || pickLocation ? candidates.length : ''}
            </Button>
          </div>

          <div className="grid gap-2">
            <Input
              type="search"
              aria-label="Find an asset"
              placeholder="Or find one: tag, model, room..."
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <ul className="grid gap-1" aria-label="Matching assets">
                {matches.length === 0 && (
                  <li className="px-1 text-sm text-muted-foreground">Nothing matches.</li>
                )}
                {matches.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        addAssets([a])
                        setSearch('')
                      }}
                    >
                      <span className="font-mono">{a.asset_tag}</span>
                      <span className="truncate text-muted-foreground">
                        {[a.category?.name, a.make, a.model, a.location?.name]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No assets on this job yet.
            </p>
          ) : (
            <ul className="space-y-3" aria-label="Job lines">
              {lines.map((l) => {
                const asset = byId.get(l.assetId)
                const interval =
                  categories.data?.find((c) => c.id === asset?.category_id)
                    ?.service_interval_days ?? null
                const auto = nextDueFrom(header.serviceDate, interval)
                const faultChoices = openFaults.filter((f) => f.asset_id === l.assetId)
                return (
                  <li key={l.key} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-6">
                    <div className="flex items-start justify-between gap-2 sm:col-span-6">
                      <div className="min-w-0 text-sm">
                        <span className="font-mono">{asset?.asset_tag}</span>{' '}
                        <span className="text-muted-foreground">
                          {[asset?.category?.name, asset?.make, asset?.model, asset?.location?.name]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${asset?.asset_tag}`}
                        onClick={() => setLines((cur) => cur.filter((x) => x.key !== l.key))}
                      >
                        <X />
                      </Button>
                    </div>
                    <Field label="Work done" htmlFor={`work-${l.key}`} className="sm:col-span-3">
                      <Input
                        id={`work-${l.key}`}
                        value={l.workDone}
                        onChange={(e) => setLine(l.key, { workDone: e.target.value })}
                      />
                    </Field>
                    <Field label="Cost (LKR)" htmlFor={`cost-${l.key}`} className="sm:col-span-1">
                      <Input
                        id={`cost-${l.key}`}
                        inputMode="decimal"
                        value={l.cost}
                        onChange={(e) => setLine(l.key, { cost: e.target.value })}
                      />
                    </Field>
                    <Field
                      label="Next due"
                      htmlFor={`due-${l.key}`}
                      className="sm:col-span-2"
                      hint={
                        l.nextDue
                          ? undefined
                          : auto
                            ? `${formatDate(auto)} (every ${interval} days)`
                            : 'No interval set for this category'
                      }
                    >
                      <Input
                        id={`due-${l.key}`}
                        type="date"
                        value={l.nextDue}
                        onChange={(e) => setLine(l.key, { nextDue: e.target.value })}
                      />
                    </Field>
                    {faultChoices.length > 0 && (
                      <Field
                        label="Fixes a fault"
                        htmlFor={`fault-${l.key}`}
                        className="sm:col-span-6"
                        hint="Linking it closes the fault; its cost stays on this line."
                      >
                        <NativeSelect
                          id={`fault-${l.key}`}
                          value={l.faultId ?? ''}
                          onChange={(e) =>
                            setLine(l.key, {
                              faultId: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        >
                          <option value="">No fault</option>
                          {faultChoices.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.fault_no}: {f.description}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-3 text-sm">
            <span>
              {lines.length} line{lines.length === 1 ? '' : 's'}
            </span>
            <span className="font-medium tabular-nums">
              Lines total {formatMoney(total) || 'LKR 0'}
            </span>
          </div>
          {mismatch !== null && (
            <Alert role="status">
              <AlertDescription>
                The lines add up to {formatMoney(total) || 'LKR 0'}, but the invoice total is{' '}
                {formatMoney(Number(header.invoiceTotal.replace(/,|LKR|\s/gi, '')))}. That is{' '}
                {formatMoney(Math.abs(mismatch))} {mismatch > 0 ? 'more' : 'less'} on the invoice.
                You can still save it.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {(formError || record.error) && (
        <Alert variant="destructive">
          <AlertDescription>{formError ?? errorMessage(record.error)}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="button" disabled={record.isPending} onClick={submit}>
          {record.isPending ? 'Saving...' : 'Save job'}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link to="/service">Cancel</Link>
        </Button>
      </div>
    </div>
  )
}
