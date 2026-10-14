import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { assetKeys } from '@/features/assets/api'
import { dashboardKeys } from '@/features/dashboard/useDashboard'
import { lookupKeys } from '@/features/lookups/useLookups'
import { peopleKeys } from '@/features/people/api'
import { errorMessage } from '@/lib/errors'

import { type ParseResult, parseWorkbook } from './parseWorkbook'
import { readWorkbook } from './readWorkbook'
import { type ImportCounts, runImport as callImport } from './runImport'

export function ImportPage() {
  const qc = useQueryClient()
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<ParseResult | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [done, setDone] = useState<ImportCounts | null>(null)

  const runImport = useMutation({
    mutationFn: (result: ParseResult) => callImport(result.payload),
    onSuccess: (counts) => {
      setDone(counts)
      for (const key of [assetKeys.all, peopleKeys.all, lookupKeys.all, dashboardKeys.all]) {
        void qc.invalidateQueries({ queryKey: key })
      }
    },
  })

  async function choose(file: File | undefined) {
    if (!file) return
    setReadError(null)
    setPreview(null)
    setDone(null)
    runImport.reset()
    setFileName(file.name)
    try {
      setPreview(parseWorkbook(await readWorkbook(await file.arrayBuffer())))
    } catch (e) {
      setReadError(
        `${errorMessage(e)} — is this the workbook? It needs the "Asset Register", "Change Log" and "Lists" tabs.`,
      )
    }
  }

  const problems = preview?.warnings.filter((w) => w.level === 'warning') ?? []
  const notes = preview?.warnings.filter((w) => w.level === 'info') ?? []

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Import from the workbook"
        description="Reads IT_Asset_Inventory_Phoenix_BPO.xlsx on this computer. Nothing is sent anywhere until you press Import."
      />

      <Card className="mb-4">
        <CardContent>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center hover:bg-accent">
            <FileSpreadsheet className="size-8 text-muted-foreground" />
            <span className="font-medium">{fileName || 'Choose the Excel workbook'}</span>
            <span className="text-sm text-muted-foreground">
              .xlsx, straight from your computer
            </span>
            <input
              type="file"
              className="sr-only"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => void choose(e.target.files?.[0])}
            />
          </label>
        </CardContent>
      </Card>

      {readError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{readError}</AlertDescription>
        </Alert>
      )}

      {done && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-green-600" /> Imported
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              {done.assets} asset{done.assets === 1 ? '' : 's'}, {done.employees} people,{' '}
              {done.accessories} accessories and {done.changes} Change Log rows are in.
            </p>
            <p className="text-sm text-muted-foreground">
              Running this again with the same file changes nothing, so it is safe to repeat after
              you fix something in Excel.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/assets">See the assets</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/">Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {preview && !done && (
        <>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>What this will bring in</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From the workbook</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    ['Assets', preview.counts.assets],
                    ['People', preview.counts.employees],
                    ['Categories', preview.counts.categories],
                    ['Locations', preview.counts.locations],
                    ['Change Log rows', preview.counts.changes],
                  ].map(([label, n]) => (
                    <TableRow key={label}>
                      <TableCell>{label}</TableCell>
                      <TableCell className="text-right tabular-nums">{n}</TableCell>
                    </TableRow>
                  ))}
                  {preview.accessoryRows > 0 && (
                    <TableRow>
                      <TableCell className="text-muted-foreground">
                        Mouse and keyboard rows, ticked on their laptop instead
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {preview.accessoryRows}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {problems.length > 0 && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle />
              <AlertTitle>
                {problems.length} thing{problems.length === 1 ? '' : 's'} to look at
              </AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4">
                  {problems.map((w) => (
                    <li key={w.message}>{w.message}</li>
                  ))}
                </ul>
                <p className="mt-2">
                  You can import anyway and fix these in the app, or fix the workbook and choose it
                  again.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {notes.length > 0 && (
            <Alert className="mb-4">
              <Info />
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4">
                  {notes.map((w) => (
                    <li key={w.message}>{w.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {runImport.error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{errorMessage(runImport.error)}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              disabled={runImport.isPending || preview.counts.assets === 0}
              onClick={() => runImport.mutate(preview)}
            >
              <Upload />
              {runImport.isPending ? 'Importing...' : `Import ${preview.counts.assets} assets`}
            </Button>
            <Button variant="outline" onClick={() => setPreview(null)}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
