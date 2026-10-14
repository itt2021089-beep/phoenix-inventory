import { AlertTriangle, ArrowLeft, Download } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'

import { Field } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/features/auth/useAuth'
import { activeOr, useDepartments, useVendors } from '@/features/lookups/useLookups'
import { usePeople } from '@/features/people/api'
import { STOCK_MOVEMENT_TYPE_LABELS, labelOf } from '@/lib/constants'
import type { StockItem } from '@/lib/db'
import { errorMessage } from '@/lib/errors'
import { downloadWorkbook, exportFileName } from '@/lib/excel'
import { formatDate, formatMoney, todayInColombo } from '@/lib/format'
import { cn } from '@/lib/utils'

import { useMovements, useRecordMovement, useStockList, useUpdateStockItem } from './api'
import {
  emptyMovement,
  inOut,
  MOVEMENT_COLUMNS,
  type MovementDraft,
  movementParty,
  movementRow,
  needsReorder,
  STOCK_ACTION_LABELS,
  type StockAction,
  validateMovement,
} from './stockForm'

export function StockItemPage() {
  const { code } = useParams()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const items = useStockList()
  const moves = useMovements()
  const s = items.data?.find((x) => x.item_code === code)
  // Kept here: saving rebuilds the details form, which would lose a "Saved." kept inside it.
  const [detailsSaved, setDetailsSaved] = useState(false)

  if (!s) {
    return (
      <>
        <PageHeader title={code} />
        <QueryState isLoading={items.isLoading} error={items.error} />
        {!items.isLoading && !items.error && (
          <p className="text-sm text-muted-foreground">
            No stock item has the code {code}.{' '}
            <Link className="underline" to="/stock">
              Back to stock
            </Link>
          </p>
        )}
      </>
    )
  }

  const mine = (moves.data ?? []).filter((m) => m.stock_item_id === s.id)
  const t = inOut(mine)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        to="/stock"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Stock
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span>{s.name}</span>
            <span className="font-mono text-sm font-normal text-muted-foreground">
              {s.item_code}
            </span>
          </span>
        }
        description={s.notes ?? undefined}
      />

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">In stock</dt>
              <dd
                className={cn(
                  'text-2xl font-semibold tabular-nums',
                  s.is_active && needsReorder(s) && 'text-red-700 dark:text-red-400',
                )}
              >
                {s.qty_on_hand} <span className="text-sm font-normal">{s.unit}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Reorder when down to</dt>
              <dd className="tabular-nums">{s.reorder_level || 'Never'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Received in all</dt>
              <dd className="tabular-nums">{moves.data ? t.received : ''}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Issued in all</dt>
              <dd className="tabular-nums">{moves.data ? t.issued : ''}</dd>
            </div>
          </dl>
          {s.is_active && needsReorder(s) && (
            <p
              role="status"
              className="mt-3 flex items-center gap-1 text-sm text-red-700 dark:text-red-400"
            >
              <AlertTriangle className="size-4" /> At or below the reorder level. Time to order
              more.
            </p>
          )}
        </CardContent>
      </Card>

      {isAdmin && <RecordStock key={s.id} item={s} />}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>History</CardTitle>
          <Button
            variant="outline"
            size="sm"
            disabled={!mine.length}
            onClick={() =>
              void downloadWorkbook(
                exportFileName(`Stock_${s.item_code}_Phoenix_BPO`, todayInColombo()),
                [
                  {
                    name: s.name.slice(0, 31),
                    columns: MOVEMENT_COLUMNS,
                    rows: mine.map(movementRow),
                  },
                ],
              )
            }
          >
            <Download /> Export to Excel
          </Button>
        </CardHeader>
        <CardContent>
          <QueryState isLoading={moves.isLoading} error={moves.error} />
          {moves.data && mine.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing has come in or gone out yet.</p>
          )}
          {mine.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="hidden sm:table-cell">Who / where</TableHead>
                  <TableHead className="hidden md:table-cell">Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(m.movement_date)}
                    </TableCell>
                    <TableCell>
                      {labelOf(STOCK_MOVEMENT_TYPE_LABELS, m.movement_type)}
                      {m.change?.asset && (
                        <Link
                          to={`/assets/${m.change.asset.asset_tag}`}
                          className="ml-2 font-mono text-xs text-muted-foreground underline underline-offset-2"
                        >
                          {m.change.asset.asset_tag}
                        </Link>
                      )}
                      {m.notes && <div className="text-xs text-muted-foreground">{m.notes}</div>}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        m.qty_change < 0
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-green-700 dark:text-green-400',
                      )}
                    >
                      {m.qty_change > 0 ? `+${m.qty_change}` : m.qty_change}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{movementParty(m)}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {m.reference}
                      {m.unit_cost !== null && (
                        <div className="text-xs text-muted-foreground">
                          {formatMoney(m.unit_cost)} each
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <EditStockItem
          key={`edit-${s.id}-${s.name}-${s.reorder_level}`}
          item={s}
          saved={detailsSaved}
          setSaved={setDetailsSaved}
        />
      )}
    </div>
  )
}

/** Receive, issue, adjust or write off, with only the fields each one needs. */
function RecordStock({ item }: { item: StockItem }) {
  const [params] = useSearchParams()
  const record = useRecordMovement()
  const vendors = useVendors()
  const departments = useDepartments()
  const people = usePeople()
  const start = (params.get('action') as StockAction | null) ?? 'received'
  const [d, setD] = useState<MovementDraft>(
    emptyMovement(todayInColombo(), start in STOCK_ACTION_LABELS ? start : 'received'),
  )
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const set = (patch: Partial<MovementDraft>) => {
    setSaved(null)
    setD((cur) => ({ ...cur, ...patch }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record stock</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            const p = validateMovement(d, item.qty_on_hand)
            setProblem(p)
            if (p) return
            record.mutate(
              { stockItemId: item.id, draft: d },
              {
                onSuccess: () => {
                  setSaved(
                    `${labelOf(STOCK_MOVEMENT_TYPE_LABELS, d.action)}: ${d.qty} ${item.unit}. Saved.`,
                  )
                  // Keep the action and date for the next one; clear the rest.
                  setD(emptyMovement(d.date, d.action))
                },
              },
            )
          }}
        >
          <div
            role="radiogroup"
            aria-label="What happened"
            className="flex flex-wrap gap-2 sm:col-span-2"
          >
            {(Object.keys(STOCK_ACTION_LABELS) as StockAction[]).map((a) => (
              <Button
                key={a}
                type="button"
                role="radio"
                aria-checked={d.action === a}
                variant={d.action === a ? 'default' : 'outline'}
                size="sm"
                onClick={() => set({ action: a })}
              >
                {STOCK_ACTION_LABELS[a]}
              </Button>
            ))}
          </div>
          <Field
            label="Quantity"
            htmlFor="move-qty"
            hint={
              d.action === 'adjusted'
                ? `When a count differs from the ${item.qty_on_hand} recorded.`
                : undefined
            }
          >
            <div className="flex gap-2">
              {d.action === 'adjusted' && (
                <NativeSelect
                  aria-label="Direction"
                  value={d.direction}
                  onChange={(e) => set({ direction: e.target.value as 'up' | 'down' })}
                  className="w-auto"
                >
                  <option value="down">Fewer than recorded (−)</option>
                  <option value="up">More than recorded (+)</option>
                </NativeSelect>
              )}
              <Input
                id="move-qty"
                inputMode="numeric"
                value={d.qty}
                onChange={(e) => set({ qty: e.target.value })}
              />
            </div>
          </Field>
          <Field label="Date" htmlFor="move-date">
            <Input
              id="move-date"
              type="date"
              value={d.date}
              onChange={(e) => set({ date: e.target.value })}
            />
          </Field>
          {d.action === 'received' && (
            <>
              <Field label="Vendor" htmlFor="move-vendor">
                <NativeSelect
                  id="move-vendor"
                  value={d.vendorId}
                  onChange={(e) => set({ vendorId: e.target.value })}
                >
                  <option value="">Not recorded</option>
                  {activeOr(vendors.data).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Unit cost (LKR)" htmlFor="move-cost">
                <Input
                  id="move-cost"
                  inputMode="decimal"
                  value={d.unitCost}
                  onChange={(e) => set({ unitCost: e.target.value })}
                />
              </Field>
            </>
          )}
          {d.action === 'issued' && (
            <>
              <Field
                label="Given to"
                htmlFor="move-person"
                hint="Mice given with a laptop come off stock on the Issue screen."
              >
                <NativeSelect
                  id="move-person"
                  value={d.employeeId}
                  onChange={(e) => {
                    const p = people.data?.find((x) => x.id === e.target.value)
                    // Their department fills itself in.
                    set({
                      employeeId: e.target.value,
                      departmentId: p?.department_id ? String(p.department_id) : d.departmentId,
                    })
                  }}
                >
                  <option value="">Nobody in particular</option>
                  {(people.data ?? [])
                    .filter((p) => p.status === 'active')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Field label="Department" htmlFor="move-department">
                <NativeSelect
                  id="move-department"
                  value={d.departmentId}
                  onChange={(e) => set({ departmentId: e.target.value })}
                >
                  <option value="">Common</option>
                  {activeOr(departments.data).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </>
          )}
          <Field
            label={d.action === 'received' ? 'Invoice / reference' : 'Reference'}
            htmlFor="move-reference"
          >
            <Input
              id="move-reference"
              value={d.reference}
              onChange={(e) => set({ reference: e.target.value })}
            />
          </Field>
          <Field
            label={d.action === 'adjusted' || d.action === 'written_off' ? 'Why' : 'Notes'}
            htmlFor="move-notes"
          >
            <Input
              id="move-notes"
              value={d.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </Field>
          {(problem || record.error) && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{problem ?? errorMessage(record.error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={record.isPending}>
              {record.isPending ? 'Saving...' : STOCK_ACTION_LABELS[d.action]}
            </Button>
            {saved && (
              <span role="status" className="text-sm text-muted-foreground">
                {saved}
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/** Name, unit, reorder level, notes. The quantity is never typed here: only movements change it. */
function EditStockItem({
  item,
  saved,
  setSaved,
}: {
  item: StockItem
  saved: boolean
  setSaved: (saved: boolean) => void
}) {
  const update = useUpdateStockItem()
  const [name, setName] = useState(item.name)
  const [unit, setUnit] = useState(item.unit)
  const [reorder, setReorder] = useState(String(item.reorder_level))
  const [notes, setNotes] = useState(item.notes ?? '')
  const [active, setActive] = useState(item.is_active)
  const level = reorder.trim() === '' ? 0 : Number(reorder)
  const bad = !Number.isInteger(level) || level < 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Item details</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            setSaved(false)
            update.mutate(
              {
                id: item.id,
                changes: {
                  name: name.trim(),
                  unit: unit.trim() || 'pcs',
                  reorder_level: level,
                  notes: notes.trim() || null,
                  is_active: active,
                },
              },
              { onSuccess: () => setSaved(true) },
            )
          }}
        >
          <Field label="Item" htmlFor="edit-stock-name">
            <Input id="edit-stock-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Unit" htmlFor="edit-stock-unit">
            <Input id="edit-stock-unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </Field>
          <Field
            label="Reorder when down to"
            htmlFor="edit-stock-reorder"
            error={bad ? 'Enter a whole number of 0 or more.' : undefined}
          >
            <Input
              id="edit-stock-reorder"
              inputMode="numeric"
              value={reorder}
              onChange={(e) => setReorder(e.target.value)}
            />
          </Field>
          <Field label="Notes" htmlFor="edit-stock-notes">
            <Input id="edit-stock-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Still in use (untick to hide it from the list; its history is kept)
          </label>
          {update.error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{errorMessage(update.error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button
              type="submit"
              variant="outline"
              disabled={!name.trim() || bad || update.isPending}
            >
              {update.isPending ? 'Saving...' : 'Save details'}
            </Button>
            {saved && (
              <span role="status" className="text-sm text-muted-foreground">
                Saved.
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
