import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Download } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDashboard } from '@/features/dashboard/useDashboard'
import { useFaults } from '@/features/faults/api'
import { useServiceJobs } from '@/features/service/api'
import { SERVICE_JOB_TYPE_LABELS, labelOf } from '@/lib/constants'
import type { Tables } from '@/lib/database.types'
import { downloadWorkbook, exportFileName } from '@/lib/excel'
import { formatDate, formatMoney, todayInColombo } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

import { flagReason } from '@/features/dashboard/panels'

import {
  CAUSE_COLUMNS,
  causeCells,
  faultsByCause,
  monthLabel,
  REPLACE_COLUMNS,
  replaceCells,
  replaceRows,
  serviceByVendor,
  spendCells,
  spendColumns,
  spendGrid,
  VENDOR_COLUMNS,
  vendorCells,
} from './reports'

const TABS = [
  { key: 'replace', label: 'Repair or replace' },
  { key: 'spend', label: 'Spend by department' },
  { key: 'causes', label: 'Faults by cause' },
  { key: 'vendors', label: 'Service by vendor' },
] as const
type Tab = (typeof TABS)[number]['key']

const money = (n: number | null | undefined) => formatMoney(n ?? 0) || 'LKR 0'

function useAssetCosts() {
  return useQuery({
    queryKey: ['reports', 'asset-costs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_asset_costs').select('*')
      if (error) throw error
      return (data ?? []) as Tables<'v_asset_costs'>[]
    },
  })
}

function useSpendMonthly() {
  return useQuery({
    queryKey: ['reports', 'spend-monthly'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_spend_monthly').select('*')
      if (error) throw error
      return (data ?? []) as Tables<'v_spend_monthly'>[]
    },
  })
}

/** Four reports, each with its numbers on screen and in an Excel file. Everyone who can log in may read them. */
export function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.find((t) => t.key === params.get('tab'))?.key ?? 'replace'
  return (
    <div>
      <PageHeader title="Reports" description="Every report can be exported to Excel." />
      <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === t.key
                ? 'border-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'replace' && <ReplaceReport />}
      {tab === 'spend' && <SpendReport />}
      {tab === 'causes' && <CausesReport />}
      {tab === 'vendors' && <VendorsReport />}
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

function ReplaceReport() {
  const costs = useAssetCosts()
  const dash = useDashboard()
  const months = dash.data?.repeatMonths ?? 12
  const rows = replaceRows(costs.data ?? [])
  const noBasis = rows.filter((r) => r.no_basis).length
  return (
    <section aria-label="Repair or replace" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Flagged when repairs reach the set share of what it would cost to replace, or after repeat
          faults. Thresholds are in Settings.
        </p>
        <ExportButton
          disabled={!rows.length}
          onClick={() =>
            void downloadWorkbook(
              exportFileName('Repair_or_Replace_Phoenix_BPO', todayInColombo()),
              [
                {
                  name: 'Repair or replace',
                  columns: REPLACE_COLUMNS,
                  rows: rows.map((r) => replaceCells(r, months)),
                },
              ],
            )
          }
        />
      </div>
      <QueryState isLoading={costs.isLoading} error={costs.error} />
      {costs.data && rows.length === 0 && (
        <Empty>No asset has cost anything in repairs or had a fault yet.</Empty>
      )}
      {noBasis > 0 && (
        <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
          {noBasis} asset{noBasis === 1 ? ' has' : 's have'} repair costs but no purchase price and
          no typical cost for its category, so it cannot be flagged on spend. Set the typical
          replacement cost in Settings.
        </p>
      )}
      {rows.length > 0 && (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead className="hidden sm:table-cell">What</TableHead>
                <TableHead className="text-right">Repair spend</TableHead>
                <TableHead className="hidden text-right md:table-cell">Replacement basis</TableHead>
                <TableHead className="text-right">Share</TableHead>
                <TableHead className="hidden text-right md:table-cell">Faults</TableHead>
                <TableHead>Flag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.asset_id}
                  className={cn(r.flagged && 'bg-red-50 dark:bg-red-950/40')}
                >
                  <TableCell>
                    <Link
                      className="font-mono text-xs underline underline-offset-2"
                      to={`/assets/${r.asset_tag}`}
                    >
                      {r.asset_tag}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {[r.category, r.make, r.model].filter(Boolean).join(' · ')}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.repair_spend)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {r.replacement_basis ? (
                      <>
                        {money(r.replacement_basis)}
                        <div className="text-xs text-muted-foreground">{r.basis_source}</div>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">none set</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.spend_pct === null ? '' : `${r.spend_pct}%`}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {r.faults_last_12m}
                  </TableCell>
                  <TableCell className="text-red-700 dark:text-red-400">
                    {r.flagged ? flagReason(r, months) : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

function SpendReport() {
  const spend = useSpendMonthly()
  const g = spendGrid(spend.data ?? [])
  const cells = spendCells(g)
  return (
    <section aria-label="Spend by department" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Fault costs (in the month closed) and service job costs, under the asset&apos;s
          department. No department is Common.
        </p>
        <ExportButton
          disabled={!g.months.length}
          onClick={() =>
            void downloadWorkbook(
              exportFileName('Spend_by_Department_Phoenix_BPO', todayInColombo()),
              [{ name: 'Spend by department', columns: spendColumns(g), rows: cells }],
            )
          }
        />
      </div>
      <QueryState isLoading={spend.isLoading} error={spend.error} />
      {spend.data && g.months.length === 0 && (
        <Empty>No repair or service costs recorded yet.</Empty>
      )}
      {g.months.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                {g.departments.map((d) => (
                  <TableHead key={d} className="text-right">
                    {d}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {g.months.map((m) => (
                <TableRow key={m}>
                  <TableCell>{monthLabel(m)}</TableCell>
                  {g.departments.map((d) => (
                    <TableCell key={d} className="text-right tabular-nums">
                      {g.cell(m, d) ? money(g.cell(m, d)) : ''}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-medium tabular-nums">
                    {money(g.monthTotal(m))}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                {g.departments.map((d) => (
                  <TableCell key={d} className="text-right tabular-nums">
                    {money(g.departmentTotal(d))}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">{money(g.total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

function CausesReport() {
  const faults = useFaults()
  const rows = faultsByCause(faults.data ?? [])
  return (
    <section aria-label="Faults by cause" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          By Sahan&apos;s finding on each fault. Faults not yet investigated are Not decided.
        </p>
        <ExportButton
          disabled={!rows.length}
          onClick={() =>
            void downloadWorkbook(exportFileName('Faults_by_Cause_Phoenix_BPO', todayInColombo()), [
              { name: 'Faults by cause', columns: CAUSE_COLUMNS, rows: rows.map(causeCells) },
            ])
          }
        />
      </div>
      <QueryState isLoading={faults.isLoading} error={faults.error} />
      {faults.data && rows.length === 0 && <Empty>No faults yet.</Empty>}
      {rows.length > 0 && (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cause</TableHead>
                <TableHead className="text-right">Faults</TableHead>
                <TableHead className="text-right">Closed</TableHead>
                <TableHead className="text-right">Cost on faults</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.cause}>
                  <TableCell>{r.cause}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.faults}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.closed}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

function VendorsReport() {
  const jobs = useServiceJobs()
  const rows = serviceByVendor(jobs.data ?? [])
  const [open, setOpen] = useState<string | null>(null)
  return (
    <section aria-label="Service by vendor" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Every service job, grouped by who did the work.
        </p>
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
