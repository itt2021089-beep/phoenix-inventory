import { AlertTriangle, Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

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
import { useCategories } from '@/features/lookups/useLookups'
import { downloadWorkbook, exportFileName } from '@/lib/excel'
import { formatDate, formatMoney, todayInColombo } from '@/lib/format'
import { CONDITION_LABELS, labelOf } from '@/lib/constants'

import { useSpareEquipment } from './equipmentApi'
import {
  EQUIPMENT_COLUMNS,
  equipmentRow,
  groupByCategory,
  matchesEquipment,
} from './equipmentStock'

/** Spare laptops, headsets and the rest: what can be issued today, with its purchase details. */
export function EquipmentStockTab() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const spares = useSpareEquipment()
  const categories = useCategories()

  const categoryParam = params.get('category')
  const categoryId = categoryParam ? Number(categoryParam) : null

  const groups = groupByCategory(spares.data ?? [], categories.data ?? [], categoryId)
    .map((g) => ({ ...g, shown: g.rows.filter((r) => matchesEquipment(r, q)) }))
    // While searching, hide categories with no match; otherwise keep empty ones (they show a gap).
    .filter((g) => !q.trim() || g.shown.length > 0)

  const total = groups.reduce((n, g) => n + g.rows.length, 0)
  const shortCount = groups.filter((g) => g.short).length
  const exportRows = groups.flatMap((g) => g.shown)

  return (
    <div>
      <PageHeader
        title="Stock"
        description={
          spares.data
            ? `${total} ready to issue${shortCount ? `, ${shortCount} categor${shortCount === 1 ? 'y' : 'ies'} below minimum` : ''}`
            : undefined
        }
        actions={
          <>
            <Button
              variant="outline"
              disabled={!exportRows.length}
              onClick={() =>
                void downloadWorkbook(exportFileName('Stock_Phoenix_BPO', todayInColombo()), [
                  {
                    name: 'Equipment in stock',
                    columns: EQUIPMENT_COLUMNS,
                    rows: exportRows.map(equipmentRow),
                  },
                ])
              }
            >
              <Download /> Export to Excel
            </Button>
            {isAdmin && (
              <Button asChild>
                <Link to="/stock/receive">
                  <Plus /> Receive stock
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <Input
          type="search"
          aria-label="Search"
          placeholder="Search tag, model, serial, vendor, invoice..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <NativeSelect
          aria-label="Category"
          value={categoryParam ?? ''}
          onChange={(e) => {
            const next = new URLSearchParams(params)
            if (e.target.value) next.set('category', e.target.value)
            else next.delete('category')
            setParams(next, { replace: true })
          }}
        >
          <option value="">All categories</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <QueryState
        isLoading={spares.isLoading || categories.isLoading}
        error={spares.error ?? categories.error}
      />
      {spares.data &&
        (groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {spares.data.length ? 'Nothing in stock matches.' : 'No equipment in stock yet.'}
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.categoryId} className="rounded-xl border bg-card">
                <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2">
                  <h2 className="font-medium">{g.name}</h2>
                  <span className="text-sm text-muted-foreground">
                    {g.rows.length} in stock
                    {g.minSpares > 0 && `, minimum ${g.minSpares}`}
                  </span>
                  {g.short && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                      <AlertTriangle className="size-3" /> Below minimum
                    </span>
                  )}
                </header>
                {g.shown.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">None in stock.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tag</TableHead>
                        <TableHead>Make / model</TableHead>
                        <TableHead>Serial</TableHead>
                        <TableHead className="hidden md:table-cell">Vendor</TableHead>
                        <TableHead className="hidden lg:table-cell">Invoice</TableHead>
                        <TableHead className="hidden text-right md:table-cell">Price</TableHead>
                        <TableHead className="hidden lg:table-cell">Received</TableHead>
                        <TableHead className="hidden sm:table-cell">Warranty until</TableHead>
                        <TableHead className="hidden sm:table-cell">Condition</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.shown.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">
                            <Link to={`/assets/${r.asset_tag}`}>{r.asset_tag}</Link>
                          </TableCell>
                          <TableCell>{[r.make, r.model].filter(Boolean).join(' ')}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {r.serial_number ?? <span className="text-muted-foreground">none</span>}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">{r.supplier?.name}</TableCell>
                          <TableCell className="hidden lg:table-cell">{r.invoice_no}</TableCell>
                          <TableCell className="hidden text-right tabular-nums md:table-cell">
                            {formatMoney(r.purchase_price)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {formatDate(r.purchase_date)}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {formatDate(r.warranty_until)}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {labelOf(CONDITION_LABELS, r.condition)}
                          </TableCell>
                          <TableCell className="text-right">
                            {isAdmin && (
                              <div className="flex justify-end gap-2">
                                <Button asChild variant="outline" size="sm">
                                  <Link to={`/assets/${r.asset_tag}/edit?back=stock`}>Edit</Link>
                                </Button>
                                <Button asChild variant="outline" size="sm">
                                  <Link to={`/issue?asset=${r.asset_tag}`}>Issue</Link>
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>
            ))}
          </div>
        ))}
    </div>
  )
}
