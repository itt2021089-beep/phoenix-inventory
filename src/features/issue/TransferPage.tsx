import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { Field } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAssetList } from '@/features/assets/api'
import { heldCount, type PersonRow, useHoldings, usePeople } from '@/features/people/api'
import { errorMessage } from '@/lib/errors'
import { todayInColombo } from '@/lib/format'

import { HandoverDone } from './HandoverDone'
import { HandoverTabs } from './HandoverTabs'
import { PersonPicker } from './PersonPicker'
import { useTransfer } from './useHandover'

export function TransferPage() {
  const [params] = useSearchParams()
  const people = usePeople()
  const assets = useAssetList()
  if (!people.data || !assets.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <HandoverTabs />
        <PageHeader title="Transfer" />
        <QueryState
          isLoading={people.isLoading || assets.isLoading}
          error={people.error ?? assets.error}
        />
      </div>
    )
  }
  const startAsset = assets.data.find(
    (a) => a.asset_tag === params.get('asset') && a.assigned_employee_id,
  )
  const fromId = startAsset?.assigned_employee_id ?? params.get('employee')
  return (
    <TransferForm
      key={`${fromId}-${startAsset?.id}`}
      people={people.data}
      startFrom={people.data.find((p) => p.id === fromId) ?? null}
      startAssetIds={startAsset ? [startAsset.id] : []}
    />
  )
}

function TransferForm({
  people,
  startFrom,
  startAssetIds,
}: {
  people: PersonRow[]
  startFrom: PersonRow | null
  startAssetIds: string[]
}) {
  const transfer = useTransfer()
  const [from, setFrom] = useState<PersonRow | null>(startFrom)
  const [to, setTo] = useState<PersonRow | null>(null)
  const [assetIds, setAssetIds] = useState<string[]>(startAssetIds)
  const [date, setDate] = useState(todayInColombo())
  const [reason, setReason] = useState('')
  const [makeForm, setMakeForm] = useState(true)
  const [done, setDone] = useState<{ formNo: string | null; tags: string[] } | null>(null)
  const holdings = useHoldings(from?.id)
  const held = holdings.data ?? []

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!from || !to || !assetIds.length) return
    transfer.mutate(
      { fromId: from.id, toId: to.id, assetIds, makeForm, date, reason },
      {
        onSuccess: (formNo) =>
          setDone({
            formNo,
            tags: held.filter((h) => assetIds.includes(h.id)).map((h) => h.asset_tag),
          }),
      },
    )
  }

  if (done) {
    return (
      <>
        <HandoverTabs />
        <HandoverDone
          title={`Transferred to ${to?.full_name}`}
          formNo={done.formNo}
          tags={done.tags}
          personId={to?.id}
          againLabel="Transfer something else"
          onAgain={() => {
            setDone(null)
            setFrom(null)
            setTo(null)
            setAssetIds([])
            setReason('')
            transfer.reset()
          }}
        />
      </>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <HandoverTabs />
      <PageHeader title="Transfer" description="Move items from one person to another." />
      <form onSubmit={submit} className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>1. From</CardTitle>
          </CardHeader>
          <CardContent>
            <PersonPicker
              id="transfer-from"
              label="From"
              people={people.filter((p) => heldCount(p) > 0)}
              value={from}
              onChange={(p) => {
                setFrom(p)
                setAssetIds([])
              }}
              emptyText="Nobody who holds anything matches."
            />
          </CardContent>
        </Card>

        {from && (
          <Card>
            <CardHeader>
              <CardTitle>2. Which items</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <QueryState isLoading={holdings.isLoading} error={holdings.error} />
              {held.length > 1 && (
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAssetIds(held.map((h) => h.id))}
                  >
                    Tick all
                  </Button>
                </div>
              )}
              {held.map((h) => (
                <label key={h.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={assetIds.includes(h.id)}
                    onChange={(e) =>
                      setAssetIds(
                        e.target.checked ? [...assetIds, h.id] : assetIds.filter((x) => x !== h.id),
                      )
                    }
                  />
                  <span>
                    <span className="font-mono font-medium">{h.asset_tag}</span>
                    <span className="block text-sm text-muted-foreground">
                      {[h.category?.name, h.make, h.model].filter(Boolean).join(' · ')}
                      {h.accessories.length > 0 &&
                        ` · with ${h.accessories.map((a) => a.accessory_types?.name).join(', ')}`}
                    </span>
                  </span>
                </label>
              ))}
            </CardContent>
          </Card>
        )}

        {from && (
          <Card>
            <CardHeader>
              <CardTitle>3. To</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <PersonPicker
                id="transfer-to"
                label="To"
                people={people.filter((p) => p.status === 'active' && p.id !== from.id)}
                value={to}
                onChange={setTo}
              />
              {to && (
                <p className="text-sm text-muted-foreground">
                  Department becomes {to.department?.name ?? 'none'}; location becomes{' '}
                  {to.location?.name ?? 'unchanged (they have no desk)'}.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date" htmlFor="transfer-date">
                  <Input
                    id="transfer-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </Field>
                <Field label="Reason / details" htmlFor="transfer-reason">
                  <Input
                    id="transfer-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={makeForm}
                  onChange={(e) => setMakeForm(e.target.checked)}
                />
                Make a handover form (HO number) to print and sign
              </label>
            </CardContent>
          </Card>
        )}

        {transfer.error && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(transfer.error)}</AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={!from || !to || !assetIds.length || transfer.isPending}
        >
          {transfer.isPending
            ? 'Saving...'
            : to && assetIds.length
              ? `Transfer ${assetIds.length} item${assetIds.length === 1 ? '' : 's'} to ${to.full_name}`
              : 'Pick who from, what, and who to'}
        </Button>
      </form>
    </div>
  )
}
