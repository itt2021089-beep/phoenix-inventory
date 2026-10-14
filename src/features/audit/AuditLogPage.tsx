import { ChevronDown, Download } from 'lucide-react'
import { useState } from 'react'

import { Field } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { downloadWorkbook, exportFileName } from '@/lib/excel'
import { formatDateTime, todayInColombo } from '@/lib/format'
import { cn } from '@/lib/utils'

import { type AuditFilters, EMPTY_AUDIT_FILTERS, useAccounts, useAuditLog } from './api'
import {
  AUDIT_ACTIONS,
  AUDIT_COLUMNS,
  AUDIT_TABLES,
  auditExportRows,
  fieldChanges,
  summary,
} from './auditLog'

/**
 * Who changed what and when, newest first. IT only: it holds before-and-after copies of rows,
 * NIDs included. The log is written by the database and never edited or deleted.
 */
export function AuditLogPage() {
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS)
  const [open, setOpen] = useState<number | null>(null)
  const log = useAuditLog(filters)
  const accounts = useAccounts()
  const rows = log.data?.pages.flat() ?? []
  const who = (id: string | null) =>
    id ? (accounts.data?.find((a) => a.id === id)?.full_name ?? 'Unknown user') : 'The system'
  const set = (patch: Partial<AuditFilters>) => setFilters((f) => ({ ...f, ...patch }))

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every change to people, assets, faults, service, stock and settings, and who made it. It cannot be edited."
        actions={
          <Button
            variant="outline"
            disabled={!rows.length}
            onClick={() =>
              void downloadWorkbook(exportFileName('Audit_Log_Phoenix_BPO', todayInColombo()), [
                { name: 'Audit log', columns: AUDIT_COLUMNS, rows: auditExportRows(rows, who) },
              ])
            }
          >
            <Download /> Export what is shown
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="What" htmlFor="audit-table">
          <NativeSelect
            id="audit-table"
            value={filters.table}
            onChange={(e) => set({ table: e.target.value })}
          >
            <option value="">Everything</option>
            {Object.entries(AUDIT_TABLES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Action" htmlFor="audit-action">
          <NativeSelect
            id="audit-action"
            value={filters.action}
            onChange={(e) => set({ action: e.target.value })}
          >
            <option value="">Any</option>
            {Object.entries(AUDIT_ACTIONS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Who" htmlFor="audit-user">
          <NativeSelect
            id="audit-user"
            value={filters.user}
            onChange={(e) => set({ user: e.target.value })}
          >
            <option value="">Anyone</option>
            {accounts.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="From" htmlFor="audit-from">
          <Input
            id="audit-from"
            type="date"
            value={filters.from}
            onChange={(e) => set({ from: e.target.value })}
          />
        </Field>
        <Field label="To" htmlFor="audit-to">
          <Input
            id="audit-to"
            type="date"
            value={filters.to}
            onChange={(e) => set({ to: e.target.value })}
          />
        </Field>
      </div>

      <QueryState isLoading={log.isLoading} error={log.error} />
      {log.data && rows.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {Object.values(filters).some(Boolean)
            ? 'Nothing matches these filters.'
            : 'Nothing has been changed yet.'}
        </p>
      )}
      <ul className="divide-y rounded-xl border bg-card">
        {rows.map((r) => {
          const changes = fieldChanges(r)
          const isOpen = open === r.id
          return (
            <li key={r.id}>
              <button
                type="button"
                aria-expanded={isOpen}
                className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-accent/50"
                onClick={() => setOpen(isOpen ? null : r.id)}
              >
                <span className="min-w-0">
                  <span className="block break-words text-sm">{summary(r)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(r.at)} · {who(r.user_id)}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    'mt-1 size-4 shrink-0 transition-transform',
                    isOpen && 'rotate-180',
                  )}
                />
              </button>
              {isOpen && (
                <div className="overflow-x-auto border-t bg-muted/30 px-3 py-2">
                  {changes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No field changed.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="pr-3 font-normal">Field</th>
                          <th className="pr-3 font-normal">Before</th>
                          <th className="font-normal">After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes.map((c) => (
                          <tr key={c.field} className="align-top">
                            <td className="pr-3 font-mono text-xs">{c.field}</td>
                            <td className="pr-3 break-all text-red-700 dark:text-red-400">
                              {c.before}
                            </td>
                            <td className="break-all text-green-700 dark:text-green-400">
                              {c.after}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {log.hasNextPage && (
        <div className="mt-4 text-center">
          <Button
            variant="outline"
            disabled={log.isFetchingNextPage}
            onClick={() => void log.fetchNextPage()}
          >
            {log.isFetchingNextPage ? 'Loading...' : 'Show older changes'}
          </Button>
        </div>
      )}
    </div>
  )
}
