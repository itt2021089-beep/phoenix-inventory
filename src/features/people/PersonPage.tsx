import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Printer } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { Field } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { assetKeys } from '@/features/assets/api'
import { useAuth } from '@/features/auth/useAuth'
import { CONDITION_LABELS, labelOf } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { formatDate, todayInColombo } from '@/lib/format'
import { supabase } from '@/lib/supabase'

import { peopleKeys, useHoldings, usePerson } from './api'

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  )
}

export function PersonPage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const person = usePerson(id)
  const holdings = useHoldings(id)
  const qc = useQueryClient()
  const [leaving, setLeaving] = useState(false)
  const [leftOn, setLeftOn] = useState(todayInColombo())

  const setStatus = useMutation({
    mutationFn: async (left: boolean) => {
      const { error } = await supabase
        .from('employees')
        .update(left ? { status: 'left', left_on: leftOn } : { status: 'active', left_on: null })
        .eq('id', id!)
      if (error) throw error
    },
    onSuccess: () => {
      setLeaving(false)
      void qc.invalidateQueries({ queryKey: peopleKeys.all })
      void qc.invalidateQueries({ queryKey: assetKeys.all })
    },
  })

  const p = person.data
  if (!p) {
    return (
      <>
        <PageHeader title="Person" />
        <QueryState isLoading={person.isLoading} error={person.error} />
        {!person.isLoading && !person.error && (
          <p className="text-sm text-muted-foreground">Not found.</p>
        )}
      </>
    )
  }

  const held = holdings.data ?? []
  const hasLeft = p.status === 'left'

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        to="/people"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> People
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.full_name}
            {hasLeft && <Badge variant="secondary">Left {formatDate(p.left_on)}</Badge>}
          </span>
        }
        description={[p.designation, p.department?.name].filter(Boolean).join(' · ')}
        actions={
          <>
            {/* HR and the boss may print this too (CLAUDE.md, Users and roles). */}
            <Button variant="outline" size="sm" asChild>
              <Link to={`/print/leaver/${p.id}`} target="_blank" rel="noopener">
                <Printer /> Leaver clearance sheet
              </Link>
            </Button>
            {isAdmin && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/people/${p.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
          </>
        }
      />

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {!hasLeft && (
            <Button asChild>
              <Link to={`/issue?employee=${p.id}`}>Issue to {p.full_name.split(' ')[0]}</Link>
            </Button>
          )}
          {held.length > 0 && (
            <>
              <Button variant="outline" asChild>
                <Link to={`/return?employee=${p.id}`}>Return items</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to={`/transfer?employee=${p.id}`}>Transfer items</Link>
              </Button>
            </>
          )}
          {!hasLeft && (
            <Button variant="outline" onClick={() => setLeaving(true)}>
              Mark as left
            </Button>
          )}
          {hasLeft && (
            <Button
              variant="outline"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate(false)}
            >
              Mark as active again
            </Button>
          )}
        </div>
      )}

      {leaving && (
        <Card>
          <CardHeader>
            <CardTitle>Mark {p.full_name} as left</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {held.length > 0 ? (
              <Alert variant="destructive">
                <AlertDescription>
                  <p>
                    Still holds {held.length} item{held.length === 1 ? '' : 's'}:{' '}
                    {held.map((h) => h.asset_tag).join(', ')}. Return or transfer them first.
                  </p>
                  <Link className="underline" to={`/return?employee=${p.id}&all=1`}>
                    Return everything
                  </Link>
                </AlertDescription>
              </Alert>
            ) : (
              <Field label="Left on" htmlFor="left_on">
                <Input
                  id="left_on"
                  type="date"
                  value={leftOn}
                  onChange={(e) => setLeftOn(e.target.value)}
                  className="max-w-48"
                />
              </Field>
            )}
            {setStatus.error && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage(setStatus.error)}</AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2">
              <Button
                disabled={held.length > 0 || !leftOn || setStatus.isPending}
                onClick={() => setStatus.mutate(true)}
              >
                Mark as left
              </Button>
              <Button variant="outline" onClick={() => setLeaving(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Detail label="NID No.">
              <span className="font-mono">{p.nid}</span>
            </Detail>
            <Detail label="Department">{p.department?.name ?? 'None'}</Detail>
            <Detail label="Contact no.">{p.contact_no}</Detail>
            <Detail label="Joined">{formatDate(p.joined_on)}</Detail>
            <Detail label="Left">{formatDate(p.left_on)}</Detail>
          </dl>
          {p.notes && <p className="mt-3 border-t pt-3 text-sm whitespace-pre-wrap">{p.notes}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Holds {held.length ? `(${held.length})` : ''}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryState isLoading={holdings.isLoading} error={holdings.error} />
          {holdings.data && held.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing.</p>
          )}
          {held.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset Tag</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="hidden sm:table-cell">Condition</TableHead>
                  <TableHead>Accessories</TableHead>
                  <TableHead className="hidden sm:table-cell">Since</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {held.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-mono whitespace-nowrap">
                      <Link to={`/assets/${h.asset_tag}`}>{h.asset_tag}</Link>
                    </TableCell>
                    <TableCell>
                      {[h.category?.name, h.make, h.model].filter(Boolean).join(' · ')}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {labelOf(CONDITION_LABELS, h.condition)}
                    </TableCell>
                    <TableCell>
                      {h.accessories
                        .map((a) => a.accessory_types?.name)
                        .filter(Boolean)
                        .sort()
                        .join(', ')}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {formatDate(h.date_assigned)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
