import {
  Archive,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Building2,
  Copy,
  Package,
  Pencil,
  QrCode,
  Tag,
  Trash2,
  Undo2,
  UserRound,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'

import { ActionMenu } from '@/components/ActionMenu'
import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/useAuth'
import { useCategories } from '@/features/lookups/useLookups'
import { COMMON, CONDITION_LABELS, labelOf } from '@/lib/constants'
import { customFieldsOf } from '@/lib/db'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'

import { useAsset, useTimeline } from './api'
import {
  AccessoriesPanel,
  DepartmentPanel,
  EndOfLifePanel,
  OpenFaultPanel,
  StatusPanel,
} from './AssetActionPanels'
import { AssetPhotos } from './AssetPhotos'
import { RepairHistory } from './RepairHistory'
import { changeExtras, changeTitle, describeChange } from './timeline'

type Panel = null | 'department' | 'status' | 'accessories' | 'fault' | 'retire' | 'dispose'

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  )
}

export function AssetPage() {
  const { tag } = useParams()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const asset = useAsset(tag)
  const timeline = useTimeline(asset.data?.id)
  const categories = useCategories()
  const [params] = useSearchParams()
  // ?fault=1 (from Log a fault on the Faults page) opens the fault form straight away.
  const [panel, setPanel] = useState<Panel>(params.get('fault') === '1' ? 'fault' : null)

  const a = asset.data
  if (!a) {
    return (
      <>
        <PageHeader title={tag} />
        <QueryState isLoading={asset.isLoading} error={asset.error} />
        {!asset.isLoading && !asset.error && (
          <p className="text-sm text-muted-foreground">
            No asset has the tag {tag}.{' '}
            <Link className="underline" to="/assets">
              Back to assets
            </Link>
          </p>
        )}
      </>
    )
  }

  const category = categories.data?.find((c) => c.id === a.category_id)
  const customFields = customFieldsOf(category)
  const custom = (a.custom_values ?? {}) as Record<string, unknown>
  const accessories = a.accessories
    .map((x) => x.accessory_types?.name)
    .filter(Boolean)
    .sort()
  const active = a.status !== 'retired' && a.status !== 'disposed'

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        to="/assets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Assets
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{a.asset_tag}</span>
            <StatusBadge status={a.status} />
          </span>
        }
        description={[a.category?.name, a.make, a.model].filter(Boolean).join(' · ')}
      />

      {/* Who has it and which department it serves, first: that is what most visits are for. */}
      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
        {a.employee ? (
          <UserRound className="size-5 shrink-0 text-primary" aria-hidden />
        ) : (
          <Building2 className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <p className="min-w-0 text-sm">
          {a.employee ? (
            <>
              With{' '}
              <Link
                to={`/people/${a.assigned_employee_id}`}
                className="font-semibold hover:underline"
              >
                {a.employee.full_name}
              </Link>
              {' · '}
              {a.department?.name ?? COMMON}
              {a.date_assigned && (
                <span className="text-muted-foreground">, since {formatDate(a.date_assigned)}</span>
              )}
            </>
          ) : (
            <>
              <span className="font-semibold">{a.department?.name ?? COMMON}</span>
              <span className="text-muted-foreground"> · not with anyone</span>
              {a.status === 'spare' && (
                <span className="text-muted-foreground">, ready to issue</span>
              )}
            </>
          )}
        </p>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {a.status === 'spare' && (
            <Button asChild>
              <Link to={`/issue?asset=${a.asset_tag}`}>
                <ArrowRight /> Issue
              </Link>
            </Button>
          )}
          {a.status === 'in_use' && (
            <Button asChild>
              <Link to={`/return?asset=${a.asset_tag}`}>
                <Undo2 /> Return
              </Link>
            </Button>
          )}
          {a.status === 'in_use' && a.assigned_employee_id && (
            <Button variant="outline" asChild>
              <Link to={`/transfer?asset=${a.asset_tag}`}>
                <ArrowLeftRight /> Transfer
              </Link>
            </Button>
          )}
          {active && (
            <Button variant="outline" onClick={() => setPanel('fault')}>
              <Wrench /> Open fault
            </Button>
          )}
          <ActionMenu
            items={[
              ...(active
                ? [
                    {
                      label: 'Change status',
                      icon: <Tag />,
                      onSelect: () => setPanel('status'),
                    },
                    // Someone's item follows their department; only a shared item has its own.
                    ...(a.assigned_employee_id
                      ? []
                      : [
                          {
                            label: 'Change department',
                            icon: <Building2 />,
                            onSelect: () => setPanel('department'),
                          },
                        ]),
                    {
                      label: 'Edit accessories',
                      icon: <Package />,
                      onSelect: () => setPanel('accessories'),
                    },
                  ]
                : []),
              'separator',
              { label: 'Edit details', icon: <Pencil />, to: `/assets/${a.asset_tag}/edit` },
              { label: 'Duplicate', icon: <Copy />, to: `/assets/new?from=${a.asset_tag}` },
              {
                label: 'Print QR label',
                icon: <QrCode />,
                to: `/print/labels?tags=${encodeURIComponent(a.asset_tag)}`,
              },
              'separator',
              ...(active
                ? [
                    {
                      label: 'Retire',
                      icon: <Archive />,
                      onSelect: () => setPanel('retire'),
                      danger: true,
                    },
                  ]
                : []),
              ...(a.status !== 'disposed'
                ? [
                    {
                      label: 'Dispose',
                      icon: <Trash2 />,
                      onSelect: () => setPanel('dispose'),
                      danger: true,
                    },
                  ]
                : []),
            ]}
          />
        </div>
      )}

      {panel === 'fault' && <OpenFaultPanel asset={a} onDone={() => setPanel(null)} />}
      {panel === 'department' && <DepartmentPanel asset={a} onDone={() => setPanel(null)} />}
      {panel === 'status' && <StatusPanel asset={a} onDone={() => setPanel(null)} />}
      {panel === 'accessories' && <AccessoriesPanel asset={a} onDone={() => setPanel(null)} />}
      {(panel === 'retire' || panel === 'dispose') && (
        <EndOfLifePanel asset={a} kind={panel} onDone={() => setPanel(null)} />
      )}

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Detail label="Condition">{labelOf(CONDITION_LABELS, a.condition)}</Detail>
            <Detail label="Serial number">
              {a.serial_number && <span className="font-mono">{a.serial_number}</span>}
            </Detail>
            <Detail label="Specification">{a.specification}</Detail>
            {customFields.map((f) => {
              const v = custom[f.key]
              const shown =
                v === undefined || v === null || v === ''
                  ? ''
                  : f.type === 'boolean'
                    ? v
                      ? 'Yes'
                      : 'No'
                    : f.type === 'date'
                      ? formatDate(String(v))
                      : String(v)
              return (
                <Detail key={f.key} label={f.label}>
                  {shown}
                </Detail>
              )
            })}
            <Detail label="Accessories">
              {[accessories.join(', '), a.accessories_note].filter(Boolean).join(' · ') || 'None'}
            </Detail>
            <Detail label="Purchased">
              {[formatDate(a.purchase_date), formatMoney(a.purchase_price), a.supplier?.name]
                .filter(Boolean)
                .join(' · ')}
            </Detail>
            <Detail label="Invoice no">{a.invoice_no}</Detail>
            <Detail label="Warranty until">{formatDate(a.warranty_until)}</Detail>
            <Detail label="QR label">
              {a.label_printed_at
                ? `Printed ${formatDateTime(a.label_printed_at)}`
                : 'Not printed yet'}
            </Detail>
          </dl>
          {a.notes && <p className="mt-3 border-t pt-3 text-sm whitespace-pre-wrap">{a.notes}</p>}
        </CardContent>
      </Card>

      <RepairHistory assetId={a.id} price={a.purchase_price} />

      <AssetPhotos assetId={a.id} />

      <Card>
        <CardHeader>
          <CardTitle>Change Log</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryState isLoading={timeline.isLoading} error={timeline.error} />
          {timeline.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          )}
          <ol className="space-y-3">
            {timeline.data?.map((r) => (
              <li key={r.id} className="border-l-2 pl-3">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{changeTitle(r)}</span>
                  <span className="text-muted-foreground">{formatDate(r.change_date)}</span>
                  <span className="font-mono text-xs text-muted-foreground">{r.change_no}</span>
                  {r.handover_form && (
                    <Link
                      to={`/print/handover/${r.handover_form.form_no}`}
                      target="_blank"
                      rel="noopener"
                      className="font-mono text-xs text-muted-foreground underline underline-offset-2"
                      title="Open the handover form"
                    >
                      {r.handover_form.form_no}
                    </Link>
                  )}
                </div>
                {describeChange(r) && <p className="text-sm">{describeChange(r)}</p>}
                {changeExtras(r) && (
                  <p className="text-xs text-muted-foreground">{changeExtras(r)}</p>
                )}
                {r.reason && <p className="text-xs text-muted-foreground">{r.reason}</p>}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
