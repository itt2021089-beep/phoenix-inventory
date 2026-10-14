import { ChevronRight, Download, Plus, QrCode } from 'lucide-react'
import { useRef, useState } from 'react'
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
import { cn } from '@/lib/utils'

import { type AssetListRow, useAssetList } from './api'
import {
  ASSET_REGISTER_COLUMNS,
  type AssetFilters,
  assetRegisterRow,
  EMPTY_FILTERS,
  filterAssets,
  GROUP_BY,
  type GroupBy,
  groupAssets,
} from './filters'

const URL_FILTERS = ['category', 'status', 'department', 'location'] as const

/** The asset table. In a grouped view, `hide` drops the column the group heading already says. */
function AssetTable({ rows, hide }: { rows: AssetListRow[]; hide?: GroupBy }) {
  const navigate = useNavigate()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset Tag</TableHead>
          {hide !== 'category' && <TableHead>Category</TableHead>}
          <TableHead>Make / Model</TableHead>
          <TableHead className="hidden md:table-cell">Serial</TableHead>
          {hide !== 'status' && <TableHead>Status</TableHead>}
          {hide !== 'person' && <TableHead>Assigned To</TableHead>}
          {hide !== 'department' && (
            <TableHead className="hidden lg:table-cell">Department</TableHead>
          )}
          {hide !== 'location' && (
            <TableHead className="hidden lg:table-cell">Location / Desk</TableHead>
          )}
          {hide === 'person' && <TableHead className="hidden sm:table-cell">Accessories</TableHead>}
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
            {hide !== 'category' && <TableCell>{a.category?.name}</TableCell>}
            <TableCell>{[a.make, a.model].filter(Boolean).join(' ')}</TableCell>
            <TableCell className="hidden font-mono text-xs md:table-cell">
              {a.serial_number}
            </TableCell>
            {hide !== 'status' && (
              <TableCell>
                <StatusBadge status={a.status} />
              </TableCell>
            )}
            {hide !== 'person' && <TableCell>{a.employee?.full_name}</TableCell>}
            {hide !== 'department' && (
              <TableCell className="hidden lg:table-cell">{a.department?.name ?? COMMON}</TableCell>
            )}
            {hide !== 'location' && (
              <TableCell className="hidden lg:table-cell">{a.location?.name}</TableCell>
            )}
            {hide === 'person' && (
              <TableCell className="hidden text-muted-foreground sm:table-cell">
                {a.asset_accessories
                  .map((x) => x.accessory_types?.name)
                  .filter(Boolean)
                  .sort()
                  .join(', ')}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function AssetsListPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const groupParam = params.get('group') ?? ''
  const group: GroupBy = groupParam in GROUP_BY ? (groupParam as GroupBy) : ''
  const groupsRef = useRef<HTMLDivElement>(null)
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

  function setFilter(key: (typeof URL_FILTERS)[number] | 'group', value: string) {
    const next = new URLSearchParams(params)
    const empty = key === 'group' ? '' : EMPTY_FILTERS[key]
    if (value === empty) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const groups = groupAssets(rows, group)
  const setAllOpen = (open: boolean) =>
    groupsRef.current
      ?.querySelectorAll('details')
      .forEach((d) => ((d as HTMLDetailsElement).open = open))

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

      {/* Group by: see the assets department by department, person by person, and so on. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Group by</span>
        <div
          className="inline-flex flex-wrap overflow-hidden rounded-md border bg-card"
          role="group"
        >
          {(Object.entries(GROUP_BY) as [GroupBy, string][]).map(([key, label]) => (
            <button
              key={key || 'none'}
              type="button"
              aria-pressed={group === key}
              onClick={() => setFilter('group', key)}
              className={cn(
                'border-r px-3 py-1.5 text-sm last:border-r-0',
                group === key
                  ? 'bg-primary font-medium text-primary-foreground'
                  : 'hover:bg-accent',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {groups.length > 1 && (
          <span className="ml-auto flex gap-3 text-sm">
            <button className="underline-offset-4 hover:underline" onClick={() => setAllOpen(true)}>
              Open all
            </button>
            <button
              className="underline-offset-4 hover:underline"
              onClick={() => setAllOpen(false)}
            >
              Close all
            </button>
          </span>
        )}
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
                      // Clear the filters but keep the grouping the person chose.
                      setParams(group ? new URLSearchParams({ group }) : new URLSearchParams(), {
                        replace: true,
                      })
                    }}
                  >
                    Clear filters
                  </button>
                </>
              )}
            </p>
          ) : group ? (
            <div ref={groupsRef} className="space-y-2">
              {groups.map((g) => (
                <details
                  key={g.key}
                  // One group alone is opened straight away; with several, pick one.
                  open={groups.length === 1}
                  className="group rounded-xl border bg-card"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                      aria-hidden
                    />
                    <span className="font-semibold">{g.label}</span>
                    <span className="rounded-full bg-secondary px-2 text-xs leading-5 font-medium tabular-nums">
                      {g.rows.length}
                    </span>
                    <span className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground sm:block">
                      {g.summary}
                    </span>
                    {g.personId && (
                      <Link
                        to={`/people/${g.personId}`}
                        className="ml-auto shrink-0 text-sm text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open person
                      </Link>
                    )}
                  </summary>
                  <div className="border-t">
                    <AssetTable rows={g.rows} hide={group} />
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border bg-card">
              <AssetTable rows={rows} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
