import { Download, Plus, QrCode } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
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
import { useAssetList } from '@/features/assets/api'
import { useAuth } from '@/features/auth/useAuth'
import { AssetPicker } from '@/features/issue/AssetPicker'
import { useCategories } from '@/features/lookups/useLookups'
import { ACTIVE_STATUSES } from '@/lib/constants'
import { FAULT_STATUS_LABELS } from '@/lib/constants'
import { downloadWorkbook, exportFileName } from '@/lib/excel'
import { formatDate, formatMoney, todayInColombo } from '@/lib/format'

import { reporterName, useFaults } from './api'
import { FaultStatusBadge } from './FaultStatusBadge'
import { EMPTY_FAULT_FILTERS, FAULT_COLUMNS, faultRow, filterFaults, isNewFromQr } from './filters'

/** A report a staff member sent from a QR label that nobody has opened yet. */
function QrBadge() {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 align-middle font-sans text-[11px] font-medium whitespace-nowrap text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200">
      <QrCode className="size-3" /> New from QR
    </span>
  )
}

/**
 * The fault inbox: everything not Closed, newest first. Faults are opened here (Log a fault: pick
 * the asset, then its fault form), from Return, from the asset page or by a QR scan.
 */
export function FaultsListPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [logging, setLogging] = useState(false)
  // Only loaded once "Log a fault" is pressed.
  const assets = useAssetList({ enabled: logging })
  const filters = {
    q,
    status: params.get('status') ?? EMPTY_FAULT_FILTERS.status,
    category: params.get('category') ?? '',
  }
  const faults = useFaults()
  const categories = useCategories()
  const rows = filterFaults(faults.data ?? [], filters)
  const openCount = (faults.data ?? []).filter((f) => f.status !== 'closed').length

  function setFilter(key: 'status' | 'category', value: string) {
    const next = new URLSearchParams(params)
    if (value === (key === 'status' ? EMPTY_FAULT_FILTERS.status : '')) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader
        title="Faults"
        description={
          faults.data
            ? `${rows.length} shown, ${openCount} not closed, ${faults.data.length} in all`
            : undefined
        }
        actions={
          <>
            {isAdmin && (
              <Button onClick={() => setLogging((v) => !v)} aria-expanded={logging}>
                <Plus /> Log a fault
              </Button>
            )}
            <Button
              variant="outline"
              disabled={!rows.length}
              onClick={() =>
                void downloadWorkbook(exportFileName('Faults_Phoenix_BPO', todayInColombo()), [
                  { name: 'Fault Log', columns: FAULT_COLUMNS, rows: rows.map(faultRow) },
                ])
              }
            >
              <Download /> Export to Excel
            </Button>
          </>
        }
      />
      {logging && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Which item has the fault?</CardTitle>
          </CardHeader>
          <CardContent>
            <QueryState isLoading={assets.isLoading} error={assets.error} />
            {assets.data && (
              <AssetPicker
                id="fault-asset"
                kind="active"
                assets={assets.data.filter((a) => ACTIVE_STATUSES.includes(a.status as never))}
                pickedIds={[]}
                onPick={(a) => navigate(`/assets/${a.asset_tag}?fault=1`)}
              />
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Type or scan the tag; its fault form opens next.
            </p>
          </CardContent>
        </Card>
      )}
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <Input
          type="search"
          aria-label="Search"
          placeholder="Search tag, fault, person, vendor..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <NativeSelect
          aria-label="Status"
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
        >
          <option value="open">Not closed</option>
          <option value="new_qr">New from QR</option>
          {Object.entries(FAULT_STATUS_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
          <option value="all">All faults</option>
        </NativeSelect>
        <NativeSelect
          aria-label="Category"
          value={filters.category}
          onChange={(e) => setFilter('category', e.target.value)}
        >
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <QueryState isLoading={faults.isLoading} error={faults.error} />
      {faults.data &&
        (rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {faults.data.length ? 'No faults match these filters.' : 'No faults yet.'}
          </p>
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fault</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead className="hidden sm:table-cell">Reported</TableHead>
                  <TableHead>What&apos;s wrong</TableHead>
                  <TableHead className="hidden lg:table-cell">Reported by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((f) => (
                  <TableRow
                    key={f.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/faults/${f.fault_no}`)}
                  >
                    <TableCell className="font-mono text-xs">
                      <Link to={`/faults/${f.fault_no}`} onClick={(e) => e.stopPropagation()}>
                        {f.fault_no}
                      </Link>
                      {isNewFromQr(f) && <QrBadge />}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{f.asset?.asset_tag}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {formatDate(f.date_reported)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{f.description}</TableCell>
                    <TableCell className="hidden lg:table-cell">{reporterName(f)}</TableCell>
                    <TableCell>
                      <FaultStatusBadge status={f.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right tabular-nums">
                      {f.service_line_id ? (
                        <span className="text-xs text-muted-foreground">
                          {f.service_line?.job?.job_no ?? 'service job'}
                        </span>
                      ) : (
                        formatMoney(f.cost) || ''
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
    </div>
  )
}
