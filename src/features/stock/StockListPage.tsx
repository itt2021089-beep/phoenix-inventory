import { AlertTriangle, Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
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
import { CONSUMABLES_COLUMNS, consumablesRow } from '@/features/import-export/exportWorkbook'
import { downloadWorkbook, exportFileName } from '@/lib/excel'
import { todayInColombo } from '@/lib/format'
import { cn } from '@/lib/utils'

import { AddStockItem } from './AddStockItem'
import { useMovements, useStockList } from './api'
import { EquipmentStockTab } from './EquipmentStockTab'
import { inOut, needsReorder } from './stockForm'

/** Stock: Equipment (Spare assets with their purchase details) and Accessories & consumables. */
export function StockListPage() {
  const [params] = useSearchParams()
  const consumables = params.get('tab') === 'consumables'
  return (
    <div>
      <nav aria-label="Stock" className="mb-4 flex gap-1 border-b">
        {[
          ['/stock', 'Equipment', !consumables],
          ['/stock?tab=consumables', 'Accessories and consumables', consumables],
        ].map(([to, label, active]) => (
          <NavLink
            key={String(to)}
            to={String(to)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              active
                ? 'border-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      {consumables ? <ConsumablesTab /> : <EquipmentStockTab />}
    </div>
  )
}

/** Consumables: what is on the shelf, and what needs ordering. */
function ConsumablesTab() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const show = params.get('show') ?? 'active'
  const items = useStockList()
  const moves = useMovements()

  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const rows = (items.data ?? []).filter((s) => {
    if (show === 'active' && !s.is_active) return false
    if (show === 'reorder' && !(s.is_active && needsReorder(s))) return false
    const hay = [s.item_code, s.name, s.notes].join(' ').toLowerCase()
    return words.every((w) => hay.includes(w))
  })
  const toReorder = (items.data ?? []).filter((s) => s.is_active && needsReorder(s)).length
  const totals = (id: number) => inOut((moves.data ?? []).filter((m) => m.stock_item_id === id))

  return (
    <div>
      <PageHeader
        title="Stock"
        description={
          items.data
            ? `${rows.length} item${rows.length === 1 ? '' : 's'} shown, ${toReorder} to reorder`
            : undefined
        }
        actions={
          <>
            <Button
              variant="outline"
              disabled={!rows.length || !moves.data}
              onClick={() =>
                void downloadWorkbook(exportFileName('Consumables_Phoenix_BPO', todayInColombo()), [
                  {
                    name: 'Consumables',
                    columns: CONSUMABLES_COLUMNS,
                    rows: rows.map((s) => consumablesRow(s, totals(s.id))),
                  },
                ])
              }
            >
              <Download /> Export to Excel
            </Button>
            {isAdmin && (
              <Button onClick={() => setAdding(true)} disabled={adding}>
                <Plus /> Add stock item
              </Button>
            )}
          </>
        }
      />
      {adding && <AddStockItem onDone={() => setAdding(false)} />}
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <Input
          type="search"
          aria-label="Search"
          placeholder="Search item or code..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <NativeSelect
          aria-label="Show"
          value={show}
          onChange={(e) => {
            const next = new URLSearchParams(params)
            if (e.target.value === 'active') next.delete('show')
            else next.set('show', e.target.value)
            setParams(next, { replace: true })
          }}
        >
          <option value="active">In use</option>
          <option value="reorder">Needs reorder</option>
          <option value="all">All, including retired items</option>
        </NativeSelect>
      </div>
      <QueryState isLoading={items.isLoading} error={items.error ?? moves.error} />
      {items.data &&
        (rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {items.data.length ? 'No stock items match.' : 'No stock items yet.'}
          </p>
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">In stock</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Reorder at</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Received</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Issued</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  const t = totals(s.id)
                  return (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/stock/${s.item_code}`)}
                    >
                      <TableCell className="font-mono text-xs">
                        <Link to={`/stock/${s.item_code}`} onClick={(e) => e.stopPropagation()}>
                          {s.item_code}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {s.name}
                        {!s.is_active && (
                          <span className="ml-2 text-xs text-muted-foreground">(not used)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.qty_on_hand} <span className="text-muted-foreground">{s.unit}</span>
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {s.reorder_level}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">
                        {moves.data ? t.received : ''}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">
                        {moves.data ? t.issued : ''}
                      </TableCell>
                      <TableCell>
                        {s.is_active && needsReorder(s) && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                            <AlertTriangle className="size-3" /> Reorder
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ))}
    </div>
  )
}
