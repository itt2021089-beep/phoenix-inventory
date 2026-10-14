import { Download, Upload } from 'lucide-react'
import { Link } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/useAuth'
import { errorMessage } from '@/lib/errors'

import {
  CHANGE_LOG_COLUMNS,
  CONSUMABLES_COLUMNS,
  DASHBOARD_COLUMNS,
  FAULT_LOG_COLUMNS,
  SERVICE_LOG_COLUMNS,
} from './exportWorkbook'
import { useExportWorkbook } from './useExport'

const TABS: [string, readonly string[], string?][] = [
  ['Asset Register', [], ''],
  ['Change Log', CHANGE_LOG_COLUMNS],
  ['Fault Log', FAULT_LOG_COLUMNS, 'Fills up in Phase 2'],
  ['Service Log', SERVICE_LOG_COLUMNS, 'Fills up in Phase 2'],
  ['Consumables', CONSUMABLES_COLUMNS],
  ['Dashboard', DASHBOARD_COLUMNS],
]

export function ExportPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const exporter = useExportWorkbook()

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Export to Excel"
        description="The whole thing as one workbook, with the same tabs as the file this replaced."
      />
      <Card className="mb-4">
        <CardContent className="space-y-4">
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {TABS.map(([name, , note]) => (
              <li key={name} className="flex items-center gap-2">
                <span className="font-medium">{name}</span>
                {note && <span className="text-xs text-muted-foreground">({note})</span>}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Values only, no formulas. The header row is bold and frozen, with filters switched on.
          </p>
          {exporter.error && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(exporter.error)}</AlertDescription>
            </Alert>
          )}
          <Button size="lg" disabled={exporter.isPending} onClick={() => exporter.mutate()}>
            <Download />
            {exporter.isPending ? 'Building the workbook...' : 'Download the workbook'}
          </Button>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Coming the other way</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The Excel workbook can be read back in. It is safe to repeat: the same file imported
              twice changes nothing.
            </p>
            <Button variant="outline" asChild>
              <Link to="/import">
                <Upload /> Import from the workbook
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
