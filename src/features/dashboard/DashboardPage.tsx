import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import { type DueRow, dueLabel, flagReason, sortDue, sortFlagged, spendText } from './panels'
import { departmentGrid, useDashboard } from './useDashboard'

function Stat({
  label,
  value,
  to,
  tone,
}: {
  label: string
  value: number
  to: string
  tone?: 'warn'
}) {
  // A '#section' link scrolls this page; anything else is a route.
  const Tag = to.startsWith('#') ? 'a' : Link
  const target = to.startsWith('#') ? { href: to } : { to }
  return (
    <Tag
      {...(target as { to: string })}
      className={cn(
        'rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-accent',
        tone === 'warn' && value > 0 && 'border-red-300 dark:border-red-900',
      )}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-2xl font-semibold tabular-nums',
          tone === 'warn' && value > 0 && 'text-red-700 dark:text-red-400',
        )}
      >
        {value}
      </p>
    </Tag>
  )
}

export function DashboardPage() {
  const { data, isLoading, error } = useDashboard()

  if (!data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <QueryState isLoading={isLoading} error={error} />
      </>
    )
  }

  const t = data.totals
  const shownCategories = data.categories.filter(
    (c) => (c.active_total ?? 0) > 0 || (c.min_spares ?? 0) > 0,
  )
  const grid = departmentGrid(data.departments)

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Active means not Retired or Disposed." />

      {(t?.in_use_without_holder ?? 0) > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>In Use with no person and no location</AlertTitle>
          <AlertDescription>
            {t?.in_use_without_holder} asset(s) are marked In Use but nobody holds them and they
            have no location. Use Move on each to say where it is.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Active" value={t?.active_total ?? 0} to="/assets" />
        <Stat label="In Use" value={t?.in_use ?? 0} to="/assets?status=in_use" />
        <Stat label="Spare" value={t?.spare_total ?? 0} to="/assets?status=spare" />
        <Stat
          label="Faulty / Under Repair"
          value={t?.faulty_or_repair ?? 0}
          to="/assets?status=needs_repair"
          tone="warn"
        />
        <Stat
          label="Lost / Stolen"
          value={t?.lost_stolen ?? 0}
          to="/assets?status=lost_stolen"
          tone="warn"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Open faults" value={t?.open_faults ?? 0} to="/faults" tone="warn" />
        <Stat label="Due soon or overdue" value={t?.due_soon ?? 0} to="#due-soon" tone="warn" />
        <Stat
          label="Repair-or-replace flags"
          value={t?.flagged_assets ?? 0}
          to="#flagged"
          tone="warn"
        />
      </div>

      <DuePanel due={data.due} windowDays={data.windowDays} />

      <Card>
        <CardHeader>
          <CardTitle>Spare pool by category</CardTitle>
        </CardHeader>
        <CardContent>
          {shownCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No assets yet. Add them, or import the workbook.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                  <TableHead className="text-right">In Use</TableHead>
                  <TableHead className="text-right">Spare</TableHead>
                  <TableHead className="text-right">Min spares</TableHead>
                  <TableHead className="text-right">Faulty / Repair</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shownCategories.map((c) => (
                  <TableRow
                    key={c.category_id}
                    className={cn(c.below_min && 'bg-red-50 dark:bg-red-950/40')}
                  >
                    <TableCell>
                      <Link
                        className="underline-offset-4 hover:underline"
                        to={`/assets?category=${c.category_id}`}
                      >
                        {c.category}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.active_total}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.in_use}</TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        c.below_min && 'font-semibold text-red-700 dark:text-red-400',
                      )}
                    >
                      {c.spare}
                      {c.below_min && <span className="sr-only"> (below minimum)</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.min_spares}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(c.faulty ?? 0) + (c.under_repair ?? 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            A row turns red when the Spare count is below the minimum set in Settings.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stock to reorder</CardTitle>
          </CardHeader>
          <CardContent>
            {data.stockToReorder.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing is at or below its reorder level.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.stockToReorder.map((s) => (
                  <li key={s.stock_item_id} className="flex items-baseline justify-between gap-2">
                    <Link
                      className="underline-offset-4 hover:underline"
                      to={`/stock/${s.item_code}`}
                    >
                      {s.name}
                    </Link>
                    <span className="font-medium text-red-700 tabular-nums dark:text-red-400">
                      {s.qty_on_hand} left
                      <span className="font-normal text-muted-foreground">
                        {' '}
                        (reorder at {s.reorder_level})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Open faults
              {(t?.open_qr_faults ?? 0) > 0 && (
                <span className="ml-2 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200">
                  {t?.open_qr_faults} new from QR
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.openFaults.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open faults.</p>
            ) : (
              <>
                <ul className="space-y-2 text-sm">
                  {data.openFaults.slice(0, 5).map((f) => (
                    <li key={f.fault_id} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate">
                        <Link
                          className="font-mono text-xs underline underline-offset-2"
                          to={`/faults/${f.fault_no}`}
                        >
                          {f.fault_no}
                        </Link>{' '}
                        <span className="font-mono text-xs">{f.asset_tag}</span>{' '}
                        <span className="text-muted-foreground">{f.description}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {f.age_days === 0 ? 'today' : `${f.age_days}d`}
                      </span>
                    </li>
                  ))}
                </ul>
                {data.openFaults.length > 5 && (
                  <Link
                    to="/faults"
                    className="mt-2 inline-block text-sm underline underline-offset-4"
                  >
                    All {data.openFaults.length} open faults
                  </Link>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card id="flagged">
        <CardHeader>
          <CardTitle>Repair or replace?</CardTitle>
        </CardHeader>
        <CardContent>
          {data.flagged.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No asset has cost half its replacement price in repairs, or failed three times in a
              year. Set each category&apos;s typical replacement cost in Settings so this can work.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {sortFlagged(data.flagged).map((r) => (
                <li
                  key={r.asset_id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3"
                >
                  <span>
                    <Link
                      className="font-mono underline underline-offset-4"
                      to={`/assets/${r.asset_tag}`}
                    >
                      {r.asset_tag}
                    </Link>{' '}
                    <span className="text-muted-foreground">
                      {[r.category, r.make, r.model].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="text-red-700 dark:text-red-400">
                    {flagReason(r, data.repeatMonths)} ({spendText(r)} spent)
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/reports" className="mt-3 inline-block text-sm underline underline-offset-4">
            Full repair-vs-replace report
          </Link>
        </CardContent>
      </Card>

      {grid.departments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active assets by department</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  {grid.categories.map((c) => (
                    <TableHead key={c} className="text-right">
                      {c}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {grid.departments.map((d) => {
                  const id = grid.idOf(d)
                  return (
                    <TableRow key={d}>
                      <TableCell>
                        <Link
                          className="underline-offset-4 hover:underline"
                          to={`/assets?department=${id ?? 'common'}`}
                        >
                          {d}
                        </Link>
                      </TableCell>
                      {grid.categories.map((c) => (
                        <TableCell key={c} className="text-right tabular-nums">
                          {grid.cell(d, c) || ''}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/** Warranties ending and services due within the window; overdue ones in red. */
function DuePanel({ due, windowDays }: { due: DueRow[]; windowDays: number }) {
  const rows = sortDue(due)
  return (
    <Card id="due-soon">
      <CardHeader>
        <CardTitle>Due in the next {windowDays} days</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No warranty ends and no service is due in the next {windowDays} days.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>What</TableHead>
                <TableHead className="hidden sm:table-cell">Where</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={`${r.asset_id}-${r.kind}`}
                  className={cn(r.overdue && 'bg-red-50 dark:bg-red-950/40')}
                >
                  <TableCell>
                    <Link
                      className="font-mono text-xs underline underline-offset-2"
                      to={`/assets/${r.asset_tag}`}
                    >
                      {r.asset_tag}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {[r.category, r.make, r.model].filter(Boolean).join(' · ')}
                    </div>
                  </TableCell>
                  <TableCell
                    className={cn(r.overdue && 'font-semibold text-red-700 dark:text-red-400')}
                  >
                    {dueLabel(r)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{r.location}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDate(r.due_date)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
