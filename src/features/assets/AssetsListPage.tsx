import { Download, Plus, QrCode } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'
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
import { useCategories, useDepartments, useLocations } from '@/features/lookups/useLookups'
import { ASSET_STATUS_LABELS, COMMON } from '@/lib/constants'
import { downloadWorkbook, exportFileName } from '@/lib/excel'
import { todayInColombo } from '@/lib/format'

import { useAssetList } from './api'
import {
  ASSET_REGISTER_COLUMNS,
  type AssetFilters,
  assetRegisterRow,
  EMPTY_FILTERS,
  filterAssets,
} from './filters'

const URL_FILTERS = ['category', 'status', 'department', 'location'] as const

export function AssetsListPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // The search box is deliberately NOT in the URL: people search by NID, and an NID must never
  // end up in a URL (CLAUDE.md). The filters are, so a filtered list can be bookmarked.
  const [q, setQ] = useState('')
  const filters: AssetFilters = {
    ...EMPTY_FILTERS,
    q,
    ...Object.fromEntries(URL_FILTERS.map((k) => [k, params.get(k) ?? EMPTY_FILTERS[k]])),
  }

  const assets = useAssetList()
  const categories = useCategories()
  const departments = useDepartments()
  const locations = useLocations()
  const [exporting, setExporting] = useState(false)

  // A few hundred rows at most, so filtering on every render is cheap.
  const rows = filterAssets(assets.data ?? [], filters)

  function setFilter(key: (typeof URL_FILTERS)[number], value: string) {
    const next = new URLSearchParams(params)
    if (value === EMPTY_FILTERS[key]) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  async function exportRows() {
    setExporting(true)
    try {
      await downloadWorkbook(exportFileName('IT_Asset_Inventory_Phoenix_BPO', todayInColombo()), [
        {
          name: 'Asset Register',
          columns: ASSET_REGISTER_COLUMNS,
          rows: rows.map(assetRegisterRow),
        },
      ])
    } finally {
      setExporting(false)
    }
  }

  const filtered =
    q !== '' || URL_FILTERS.some((k) => (params.get(k) ?? EMPTY_FILTERS[k]) !== EMPTY_FILTERS[k])

  return (
    <div>
      <PageHeader
        title="Assets"
        description={
          assets.data
            ? `${rows.length} of ${assets.data.length} asset${assets.data.length === 1 ? '' : 's'}`
            : undefined
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => void exportRows()}
              disabled={!rows.length || exporting}
            >
              <Download />
              {exporting ? 'Exporting...' : 'Export to Excel'}
            </Button>
            {isAdmin && (
              <Button variant="outline" asChild>
                <Link to="/print/labels?unprinted=1">
                  <QrCode />
                  Print QR labels
                </Link>
              </Button>
            )}
            {isAdmin && (
              <Button asChild>
                <Link to="/assets/new">
                  <Plus />
                  Add assets
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          type="search"
          placeholder="Search tag, serial, person, NID, model..."
          aria-label="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="lg:col-span-1"
        />
        <NativeSelect
          aria-label="Category"
          value={filters.category}
          onChange={(e) => setFilter('category', e.target.value)}
        >
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Status"
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
        >
          <option value="active">Active (not Retired / Disposed)</option>
          <option value="all">All statuses</option>
          <option value="needs_repair">Faulty or Under Repair</option>
          {Object.entries(ASSET_STATUS_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Department"
          value={filters.department}
          onChange={(e) => setFilter('department', e.target.value)}
        >
          <option value="">All departments</option>
          {departments.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
          <option value="common">{COMMON} (no department)</option>
        </NativeSelect>
        <NativeSelect
          aria-label="Location"
          value={filters.location}
          onChange={(e) => setFilter('location', e.target.value)}
        >
          <option value="">All locations</option>
          {locations.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <QueryState isLoading={assets.isLoading} error={assets.error} />

      {assets.data && (
        <>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {filtered ? 'Nothing matches these filters.' : 'No assets yet.'}
              {filtered && (
                <>
                  {' '}
                  <button
                    className="underline underline-offset-4"
                    onClick={() => {
                      setQ('')
                      setParams(new URLSearchParams(), { replace: true })
                    }}
                  >
                    Clear filters
                  </button>
                </>
              )}
            </p>
          ) : (
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset Tag</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Make / Model</TableHead>
                    <TableHead className="hidden md:table-cell">Serial</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead className="hidden lg:table-cell">Department</TableHead>
                    <TableHead className="hidden lg:table-cell">Location / Desk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => (
                    <TableRow
                      key={a.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/assets/${a.asset_tag}`)}
                    >
                      <TableCell className="font-mono whitespace-nowrap">
                        <Link to={`/assets/${a.asset_tag}`} onClick={(e) => e.stopPropagation()}>
                          {a.asset_tag}
                        </Link>
                      </TableCell>
                      <TableCell>{a.category?.name}</TableCell>
                      <TableCell>{[a.make, a.model].filter(Boolean).join(' ')}</TableCell>
                      <TableCell className="hidden font-mono text-xs md:table-cell">
                        {a.serial_number}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={a.status} />
                      </TableCell>
                      <TableCell>{a.employee?.full_name}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {a.department?.name ?? COMMON}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{a.location?.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
