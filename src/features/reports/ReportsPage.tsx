import { ChevronDown, Download } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { useServiceJobs } from '@/features/service/api'
import { SERVICE_JOB_TYPE_LABELS, labelOf } from '@/lib/constants'
import { downloadWorkbook, exportFileName } from '@/lib/excel'
import { formatDate, formatMoney, todayInColombo } from '@/lib/format'
import { cn } from '@/lib/utils'

import { serviceByVendor, VENDOR_COLUMNS, vendorCells } from './reports'

const money = (n: number | null | undefined) => formatMoney(n ?? 0) || 'LKR 0'

/** Service history by vendor, on screen and in an Excel file. Everyone who can log in may read it. */
export function ReportsPage() {
  return (
    <div>
      <PageHeader title="Reports" />
      <VendorsReport />
    </div>
  )
}

function ExportButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button variant="outline" size="sm" disabled={disabled} onClick={onClick}>
      <Download /> Export to Excel
    </Button>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
}

function VendorsReport() {
  const jobs = useServiceJobs()
  const rows = serviceByVendor(jobs.data ?? [])
  const [open, setOpen] = useState<string | null>(null)
  return (
    <section aria-label="Service by vendor" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Service history by vendor</h2>
          <p className="text-sm text-muted-foreground">
            Every service job, grouped by who did the work.
          </p>
        </div>
        <ExportButton
          disabled={!rows.length}
          onClick={() =>
            void downloadWorkbook(
              exportFileName('Service_by_Vendor_Phoenix_BPO', todayInColombo()),
              [{ name: 'Service by vendor', columns: VENDOR_COLUMNS, rows: vendorCells(rows) }],
            )
          }
        />
      </div>
      <QueryState isLoading={jobs.isLoading} error={jobs.error} />
      {jobs.data && rows.length === 0 && <Empty>No service jobs yet.</Empty>}
      <ul className="space-y-3">
        {rows.map((v) => (
          <li key={v.vendor} className="rounded-xl border bg-card">
            <button
              type="button"
              aria-expanded={open === v.vendor}
              className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left"
              onClick={() => setOpen(open === v.vendor ? null : v.vendor)}
            >
              <span className="font-medium">{v.vendor}</span>
              <span className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>
                  {v.jobs} job{v.jobs === 1 ? '' : 's'}, {v.lines} asset{v.lines === 1 ? '' : 's'}
                </span>
                <span className="font-medium text-foreground tabular-nums">{money(v.cost)}</span>
                <span>last {formatDate(v.lastDate)}</span>
                <ChevronDown
                  className={cn('size-4 transition-transform', open === v.vendor && 'rotate-180')}
                />
              </span>
            </button>
            {open === v.vendor && (
              <ul className="space-y-1 border-t px-4 py-3 text-sm">
                {v.jobList.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <Link
                        className="font-mono text-xs underline underline-offset-2"
                        to={`/service/${j.job_no}`}
                      >
                        {j.job_no}
                      </Link>{' '}
                      {formatDate(j.service_date)} · {labelOf(SERVICE_JOB_TYPE_LABELS, j.job_type)}{' '}
                      · {j.lines.length} asset{j.lines.length === 1 ? '' : 's'}
                    </span>
                    <span className="tabular-nums">
                      {money(j.lines.reduce((n, l) => n + Number(l.cost), 0))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
