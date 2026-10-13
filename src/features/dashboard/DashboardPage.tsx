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
import { cn } from '@/lib/utils'

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
  return (
    <Link
      to={to}
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
    </Link>
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
