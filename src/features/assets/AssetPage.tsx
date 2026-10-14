import { ArrowLeft, Copy, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

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
import { EndOfLifePanel, MovePanel } from './AssetActionPanels'
import { changeExtras, changeTitle, describeChange } from './timeline'

type Panel = null | 'move' | 'retire' | 'dispose'

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
  const [panel, setPanel] = useState<Panel>(null)

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
        actions={
          isAdmin && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/assets/${a.asset_tag}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/assets/new?from=${a.asset_tag}`}>
                  <Copy /> Duplicate
                </Link>
              </Button>
            </>
          )
        }
      />

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {a.status === 'spare' && (
            <Button asChild>
              <Link to={`/issue?asset=${a.asset_tag}`}>Issue</Link>
            </Button>
          )}
          {a.status === 'in_use' && (
            <Button asChild>
              <Link to={`/return?asset=${a.asset_tag}`}>Return</Link>
            </Button>
          )}
          {a.status === 'in_use' && a.assigned_employee_id && (
            <Button variant="outline" asChild>
              <Link to={`/transfer?asset=${a.asset_tag}`}>Transfer</Link>
            </Button>
          )}
          {active && (
            <Button variant="outline" onClick={() => setPanel('move')}>
              Move
            </Button>
          )}
          {active && (
            <Button variant="outline" onClick={() => setPanel('retire')}>
              Retire
            </Button>
          )}
          {a.status !== 'disposed' && (
            <Button variant="outline" onClick={() => setPanel('dispose')}>
              Dispose
            </Button>
          )}
        </div>
      )}

      {panel === 'move' && <MovePanel asset={a} onDone={() => setPanel(null)} />}
      {(panel === 'retire' || panel === 'dispose') && (
        <EndOfLifePanel asset={a} kind={panel} onDone={() => setPanel(null)} />
      )}

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Detail label="Assigned to">{a.employee?.full_name ?? 'Nobody'}</Detail>
            <Detail label="Department">{a.department?.name ?? COMMON}</Detail>
            <Detail label="Location / desk">{a.location?.name ?? 'Not set'}</Detail>
            <Detail label="Date assigned">{formatDate(a.date_assigned)}</Detail>
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
                    <span className="font-mono text-xs text-muted-foreground">
                      {r.handover_form.form_no}
                    </span>
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
