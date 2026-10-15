import { Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

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
import { useDepartments } from '@/features/lookups/useLookups'
import { downloadWorkbook, exportFileName } from '@/lib/excel'
import { todayInColombo } from '@/lib/format'

import { heldCount, usePeople } from './api'
import { EMPTY_PEOPLE_FILTERS, filterPeople, PEOPLE_COLUMNS, peopleRow } from './filters'

export function PeopleListPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // Search text stays out of the URL: it may be an NID (CLAUDE.md).
  const [q, setQ] = useState('')
  const filters = {
    q,
    status: params.get('status') ?? EMPTY_PEOPLE_FILTERS.status,
    department: params.get('department') ?? '',
  }
  const people = usePeople()
  const departments = useDepartments()
  const rows = filterPeople(people.data ?? [], filters)

  function setFilter(key: 'status' | 'department', value: string) {
    const next = new URLSearchParams(params)
    if (value === EMPTY_PEOPLE_FILTERS[key]) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader
        title="People"
        description={people.data ? `${rows.length} of ${people.data.length}` : undefined}
        actions={
          <>
            <Button
              variant="outline"
              disabled={!rows.length}
              onClick={() =>
                void downloadWorkbook(exportFileName('People_Phoenix_BPO', todayInColombo()), [
                  { name: 'People', columns: PEOPLE_COLUMNS, rows: rows.map(peopleRow) },
                ])
              }
            >
              <Download /> Export to Excel
            </Button>
            {isAdmin && (
              <Button asChild>
                <Link to="/people/new">
                  <Plus /> Add person
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
          placeholder="Search name, NID, designation..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <NativeSelect
          aria-label="Status"
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
        >
          <option value="active">Active</option>
          <option value="left">Left</option>
          <option value="all">Everyone</option>
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
          <option value="none">No department</option>
        </NativeSelect>
      </div>
      <QueryState isLoading={people.isLoading} error={people.error} />
      {people.data &&
        (rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {people.data.length ? 'Nobody matches these filters.' : 'No people yet.'}
          </p>
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">NID No.</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="hidden md:table-cell">Designation</TableHead>
                  <TableHead className="text-right">Holds</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/people/${p.id}`)}
                  >
                    <TableCell>
                      <Link to={`/people/${p.id}`} onClick={(e) => e.stopPropagation()}>
                        {p.full_name}
                      </Link>
                      {p.status === 'left' && (
                        <span className="ml-2 text-xs text-muted-foreground">(left)</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs sm:table-cell">
                      {p.nid}
                    </TableCell>
                    <TableCell>{p.department?.name}</TableCell>
                    <TableCell className="hidden md:table-cell">{p.designation}</TableCell>
                    <TableCell className="text-right tabular-nums">{heldCount(p) || ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
    </div>
  )
}
