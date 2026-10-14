import { Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

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
import { SERVICE_JOB_TYPE_LABELS, labelOf } from '@/lib/constants'
import { downloadWorkbook, exportFileName } from '@/lib/excel'
import { formatDate, formatMoney, todayInColombo } from '@/lib/format'

import { useServiceJobs } from './api'
import { filterJobs, jobCost, SERVICE_COLUMNS, serviceRows } from './filters'

export function ServiceListPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const navigate = useNavigate()
  const jobs = useServiceJobs()
  const [q, setQ] = useState('')
  const [jobType, setJobType] = useState('')
  const rows = filterJobs(jobs.data ?? [], q, jobType)

  return (
    <div>
      <PageHeader
        title="Service jobs"
        description={jobs.data ? `${rows.length} of ${jobs.data.length}` : undefined}
        actions={
          <>
            <Button
              variant="outline"
              disabled={!rows.length}
              onClick={() =>
                void downloadWorkbook(exportFileName('Service_Phoenix_BPO', todayInColombo()), [
                  { name: 'Service Log', columns: SERVICE_COLUMNS, rows: serviceRows(rows) },
                ])
              }
            >
              <Download /> Export to Excel
            </Button>
            {isAdmin && (
              <Button asChild>
                <Link to="/service/new">
                  <Plus /> New service job
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
          placeholder="Search job, vendor, tag, work..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <NativeSelect
          aria-label="Type"
          value={jobType}
          onChange={(e) => setJobType(e.target.value)}
        >
          <option value="">All types</option>
          {Object.entries(SERVICE_JOB_TYPE_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <QueryState isLoading={jobs.isLoading} error={jobs.error} />
      {jobs.data &&
        (rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {jobs.data.length ? 'No jobs match these filters.' : 'No service jobs yet.'}
          </p>
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead className="hidden md:table-cell">Vendor</TableHead>
                  <TableHead className="text-right">Assets</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((j) => (
                  <TableRow
                    key={j.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/service/${j.job_no}`)}
                  >
                    <TableCell className="font-mono text-xs">
                      <Link to={`/service/${j.job_no}`} onClick={(e) => e.stopPropagation()}>
                        {j.job_no}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(j.service_date)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {labelOf(SERVICE_JOB_TYPE_LABELS, j.job_type)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{j.vendor?.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{j.lines.length}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(jobCost(j)) || 'LKR 0'}
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
