import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/features/auth/useAuth'
import { usePhotos } from '@/features/photos/api'
import { PhotoGallery } from '@/features/photos/PhotoGallery'
import { PhotoUpload } from '@/features/photos/PhotoUpload'
import { SERVICE_JOB_TYPE_LABELS, labelOf } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'

import { useServiceJob } from './api'
import { jobCost } from './filters'

export function ServiceJobPage() {
  const { no } = useParams()
  const job = useServiceJob(no)
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const j = job.data
  const invoicePhotos = usePhotos('service_job', j ? String(j.id) : undefined)

  if (!j) {
    return (
      <>
        <PageHeader title={no} />
        <QueryState isLoading={job.isLoading} error={job.error} />
        {!job.isLoading && !job.error && (
          <p className="text-sm text-muted-foreground">
            No service job has the number {no}.{' '}
            <Link className="underline" to="/service">
              Back to service jobs
            </Link>
          </p>
        )}
      </>
    )
  }

  const total = jobCost(j)
  const lines = [...j.lines].sort((a, b) =>
    (a.asset?.asset_tag ?? '').localeCompare(b.asset?.asset_tag ?? ''),
  )

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        to="/service"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Service jobs
      </Link>
      <PageHeader
        title={<span className="font-mono">{j.job_no}</span>}
        description={[
          labelOf(SERVICE_JOB_TYPE_LABELS, j.job_type),
          formatDate(j.service_date),
          j.vendor?.name,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            {[
              ['Invoice no', j.invoice_no],
              ['Invoice total', j.invoice_total !== null ? formatMoney(j.invoice_total) : ''],
              ['Lines total', formatMoney(total) || 'LKR 0'],
            ].map(
              ([label, value]) =>
                value && (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ),
            )}
          </dl>
          {j.invoice_total !== null && Number(j.invoice_total) !== total && (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              The lines do not add up to the invoice total (difference{' '}
              {formatMoney(Math.abs(Number(j.invoice_total) - total))}).
            </p>
          )}
          {j.notes && <p className="mt-3 border-t pt-3 text-sm whitespace-pre-wrap">{j.notes}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {lines.length} asset{lines.length === 1 ? '' : 's'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Work done</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="hidden sm:table-cell">Next due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link
                      className="font-mono text-xs underline underline-offset-2"
                      to={`/assets/${l.asset?.asset_tag}`}
                    >
                      {l.asset?.asset_tag}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {[l.asset?.category?.name, l.asset?.location?.name]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </TableCell>
                  <TableCell>
                    {l.work_done}
                    {l.faults.map((f) => (
                      <Link
                        key={f.fault_no}
                        to={`/faults/${f.fault_no}`}
                        className="ml-2 font-mono text-xs text-muted-foreground underline underline-offset-2"
                      >
                        {f.fault_no}
                      </Link>
                    ))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(l.cost) || 'LKR 0'}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {formatDate(l.next_due_date)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {(isAdmin || !!invoicePhotos.data?.length) && (
        <Card>
          <CardHeader>
            <CardTitle>Invoice photo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PhotoGallery
              photos={invoicePhotos.data ?? []}
              label="Invoice photos"
              emptyText="No photo of the invoice yet."
            />
            {isAdmin && (
              <PhotoUpload
                target={{
                  entity: 'service_job',
                  entityId: String(j.id),
                  folderKey: j.job_no,
                  kind: 'invoice',
                }}
                max={3}
                label="Photograph the invoice"
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
