import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  PackagePlus,
  Undo2,
  UserPlus,
} from 'lucide-react'
import { useRef } from 'react'
import { Link } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
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
import { formatDate, todayInColombo } from '@/lib/format'
import { cn } from '@/lib/utils'

import { type AttentionItem, attentionItems, type DueRow, dueLabel, sortDue } from './panels'
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
        'rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent',
        tone === 'warn' && value > 0 && 'border-red-300 dark:border-red-900',
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-xl font-semibold tabular-nums',
          tone === 'warn' && value > 0 && 'text-red-700 dark:text-red-400',
        )}
      >
        {value}
      </p>
    </Link>
  )
}

/**
 * Home: the shortcuts Sahan uses most, then one list of what needs doing, then the counts.
 * The full reminder list is folded away at the bottom; the list at the top groups it.
 */
export function DashboardPage() {
  const { data, isLoading, error } = useDashboard()
  const { profile } = useAuth()
  const dueRef = useRef<HTMLDetailsElement>(null)

  if (!data) {
    return (
      <>
        <PageHeader title="Home" />
        <QueryState isLoading={isLoading} error={error} />
      </>
    )
  }

  const t = data.totals
  const shownCategories = data.categories.filter(
    (c) => (c.active_total ?? 0) > 0 || (c.min_spares ?? 0) > 0,
  )
  const grid = departmentGrid(data.departments)
  const attention = attentionItems(data)
  // A grouped reminder opens the folded list below and scrolls to it.
  const openDue = () => {
    if (!dueRef.current) return
    dueRef.current.open = true
    dueRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Home" description={`Today is ${formatDate(todayInColombo())}.`} />

      {profile?.role === 'admin' && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button asChild>
            <Link to="/issue">
              <ArrowLeftRight aria-hidden />
              Issue
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/return">
              <Undo2 aria-hidden />
              Return
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/assets/new">
              <PackagePlus aria-hidden />
              Add asset
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/people/new">
              <UserPlus aria-hidden />
              New joiner
            </Link>
          </Button>
        </div>
      )}

      <AttentionPanel items={attention} onOpenDue={openDue} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="In Use" value={t?.in_use ?? 0} to="/assets?status=in_use" />
        <Stat
          label="Spare (ready to issue)"
          value={t?.spare_total ?? 0}
          to="/assets?status=spare"
        />
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
        <Stat label="Active (not retired)" value={t?.active_total ?? 0} to="/assets" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                    <TableHead className="text-right">In Use</TableHead>
                    <TableHead className="text-right">Spare</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                    <TableHead className="text-right">Faulty</TableHead>
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
                      <TableCell className="text-right tabular-nums">{c.in_use}</TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums',
                          c.below_min && 'font-semibold text-red-700 dark:text-red-400',
                        )}
                      >
                        <Link
                          className="underline-offset-4 hover:underline"
                          to={`/assets?category=${c.category_id}&status=spare`}
                        >
                          {c.spare}
                        </Link>
                        {c.below_min && <span className="sr-only"> (below minimum)</span>}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {c.min_spares || ''}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(c.faulty ?? 0) + (c.under_repair ?? 0) || ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Red when the Spare count is below the minimum set in Settings.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Assets by department</CardTitle>
            <Link to="/assets?group=department" className="text-sm text-primary hover:underline">
              Open grouped list
            </Link>
          </CardHeader>
          <CardContent>
            {grid.departments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active assets yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {grid.departments.map((d) => {
                  const counts = grid.categories
                    .map((c) => ({ c, n: grid.cell(d, c) }))
                    .filter((x) => x.n > 0)
                  const total = counts.reduce((sum, x) => sum + x.n, 0)
                  return (
                    <li key={d}>
                      <Link
                        to={`/assets?department=${grid.idOf(d) ?? 'common'}`}
                        className="flex items-center gap-3 py-2 hover:bg-accent/50"
                      >
                        <span className="w-24 shrink-0 font-medium">{d}</span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {counts.map((x) => `${x.n} ${x.c}`).join(' · ')}
                        </span>
                        <span className="font-semibold tabular-nums">{total}</span>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <DuePanel detailsRef={dueRef} due={data.due} windowDays={data.windowDays} />
    </div>
  )
}

/** One short list of what needs doing: red first, then amber; each line opens where to act. */
function AttentionPanel({ items, onOpenDue }: { items: AttentionItem[]; onOpenDue: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-green-600" aria-hidden />
            All clear: nothing is overdue, running low or waiting on you.
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-md border">
            {items.map((i) => {
              const Icon = i.tone === 'danger' ? AlertTriangle : CircleAlert
              const inner = (
                <>
                  <Icon
                    className={cn(
                      'size-4 shrink-0',
                      i.tone === 'danger'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-600 dark:text-amber-400',
                    )}
                    aria-hidden
                  />
                  <span className="flex-1">{i.text}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </>
              )
              const cls = cn(
                'flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent',
                i.tone === 'danger' && 'bg-red-50/70 dark:bg-red-950/30',
              )
              return (
                <li key={i.key}>
                  {i.to === '#due-soon' ? (
                    <button type="button" className={cls} onClick={onOpenDue}>
                      {inner}
                    </button>
                  ) : (
                    <Link to={i.to} className={cls}>
                      {inner}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** Every warranty ending and service due within the window, one row each; folded by default. */
function DuePanel({
  detailsRef,
  due,
  windowDays,
}: {
  detailsRef: React.Ref<HTMLDetailsElement>
  due: DueRow[]
  windowDays: number
}) {
  const rows = sortDue(due)
  return (
    <details ref={detailsRef} id="due-soon" className="group rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-6 py-4 font-semibold">
        <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
        All reminders in the next {windowDays} days
        <span className="font-normal text-muted-foreground">({rows.length})</span>
      </summary>
      <div className="px-6 pb-6">
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
                    <Link className="font-mono text-xs" to={`/assets/${r.asset_tag}`}>
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
                  <TableCell className="text-right tabular-nums">
                    {formatDate(r.due_date)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </details>
  )
}
