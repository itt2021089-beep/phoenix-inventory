import { Link } from 'react-router'

import { QueryState } from '@/components/QueryState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAssetFaults } from '@/features/faults/api'
import { FaultStatusBadge } from '@/features/faults/FaultStatusBadge'
import { repairSpend } from '@/features/faults/filters'
import { useAssetService } from '@/features/service/api'
import { SERVICE_JOB_TYPE_LABELS, labelOf } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'

/**
 * "Repair spend so far", the faults and the service history of one asset.
 * Each cost is counted once: a fault fixed alone carries its own, a fault fixed inside a
 * service job carries 0 and the cost sits on that job's line (CLAUDE.md, rule 7).
 */
export function RepairHistory({ assetId, price }: { assetId: string; price: number | null }) {
  const faults = useAssetFaults(assetId)
  const service = useAssetService(assetId)
  const f = faults.data ?? []
  const s = service.data ?? []
  const spend = repairSpend(
    f,
    s.map((l) => l.cost),
  )
  const empty = !faults.isLoading && !service.isLoading && f.length === 0 && s.length === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Faults and service</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <QueryState
          isLoading={faults.isLoading || service.isLoading}
          error={faults.error ?? service.error}
        />
        {empty && <p className="text-sm text-muted-foreground">No faults or service jobs yet.</p>}
        {!empty && !faults.isLoading && !service.isLoading && (
          <p className="text-sm">
            <span className="text-muted-foreground">Repair spend so far: </span>
            <span className="font-medium tabular-nums">{formatMoney(spend) || 'LKR 0'}</span>
            {price ? (
              <span className="text-muted-foreground">
                {' '}
                ({Math.round((spend / price) * 100)}% of the {formatMoney(price)} purchase price)
              </span>
            ) : null}
          </p>
        )}
        {f.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">Faults</h3>
            <ul className="space-y-2">
              {f.map((x) => (
                <li key={x.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <Link
                    className="font-mono text-xs underline underline-offset-2"
                    to={`/faults/${x.fault_no}`}
                  >
                    {x.fault_no}
                  </Link>
                  <span className="text-muted-foreground">{formatDate(x.date_reported)}</span>
                  <FaultStatusBadge status={x.status} />
                  <span className="min-w-0 break-words">{x.description}</span>
                  {x.service_line_id ? (
                    <span className="text-xs text-muted-foreground">
                      cost on {x.service_line?.job?.job_no ?? 'a service job'}
                    </span>
                  ) : Number(x.cost) > 0 ? (
                    <span className="text-xs text-muted-foreground">{formatMoney(x.cost)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
        {s.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">Service history</h3>
            <ul className="space-y-2">
              {s.map((l) => (
                <li key={l.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  {l.job && (
                    <Link
                      className="font-mono text-xs underline underline-offset-2"
                      to={`/service/${l.job.job_no}`}
                    >
                      {l.job.job_no}
                    </Link>
                  )}
                  <span className="text-muted-foreground">
                    {formatDate(l.job?.service_date)}
                    {l.job ? ` · ${labelOf(SERVICE_JOB_TYPE_LABELS, l.job.job_type)}` : ''}
                    {l.job?.vendor ? ` · ${l.job.vendor.name}` : ''}
                  </span>
                  <span className="min-w-0 break-words">{l.work_done}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatMoney(l.cost) || 'LKR 0'}
                  </span>
                  {l.next_due_date && (
                    <span className="text-xs text-muted-foreground">
                      next due {formatDate(l.next_due_date)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
