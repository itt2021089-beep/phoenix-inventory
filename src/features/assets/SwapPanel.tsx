import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import { Field } from '@/components/Field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { dashboardKeys } from '@/features/dashboard/useDashboard'
import { faultKeys } from '@/features/faults/api'
import { peopleKeys } from '@/features/people/api'
import { CONDITION_LABELS, labelOf } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { todayInColombo } from '@/lib/format'
import { supabase } from '@/lib/supabase'

import { type AssetListRow, assetKeys, useAssetList } from './api'
import { sparesFor } from './spares'

function useSwap() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      faultyId: string
      spareId: string
      description: string
      date: string
      faultId: number | null
    }) => {
      const { data, error } = await supabase.rpc('swap_asset', {
        p_faulty_asset_id: args.faultyId,
        p_spare_asset_id: args.spareId,
        p_fault_description: args.description || undefined,
        p_swap_date: args.date,
        p_fault_id: args.faultId ?? undefined,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: assetKeys.all })
      void qc.invalidateQueries({ queryKey: faultKeys.all })
      void qc.invalidateQueries({ queryKey: dashboardKeys.all })
      void qc.invalidateQueries({ queryKey: peopleKeys.all })
    },
  })
}

/**
 * Replace a faulty asset from the spare pool in one step: the same person, desk and department,
 * with the accessories. The old one becomes Faulty in the IT store, ready for Send for repair.
 * From the asset page it opens a fault; from a fault page (faultId) it links that fault.
 */
export function SwapPanel({
  asset,
  faultId,
  faultText,
  onDone,
}: {
  asset: AssetListRow
  faultId?: number
  faultText?: string
  onDone?: () => void
}) {
  const assets = useAssetList()
  const swap = useSwap()
  const spares = sparesFor(assets.data ?? [], asset.id, asset.category_id)
  const [spareId, setSpareId] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayInColombo())
  const [done, setDone] = useState<{ fault: string; spare: string } | null>(null)
  const chosen = spares.find((s) => s.id === (spareId || spares[0]?.id))
  const category = asset.category?.name ?? 'asset'

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Swapped</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p role="status" className="text-sm">
            <span className="font-mono">{done.spare}</span> now has{' '}
            {asset.employee?.full_name ?? 'the person'}&apos;s place and accessories.{' '}
            <span className="font-mono">{asset.asset_tag}</span> is Faulty in the IT store, with
            fault <span className="font-mono">{done.fault}</span>.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={`/assets/${done.spare}`}>Open {done.spare}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/faults/${done.fault}`}>Open {done.fault}</Link>
            </Button>
            {onDone && (
              <Button variant="outline" onClick={onDone}>
                Close
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Swap {asset.asset_tag} for a spare</CardTitle>
      </CardHeader>
      <CardContent>
        {assets.data && spares.length === 0 ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm">
              No Spare {category.toLowerCase()}s. Receive or repair one first.
            </p>
            {onDone && (
              <Button variant="outline" onClick={onDone}>
                Close
              </Button>
            )}
          </div>
        ) : (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!chosen) return
              swap.mutate(
                {
                  faultyId: asset.id,
                  spareId: chosen.id,
                  description: description.trim(),
                  date,
                  faultId: faultId ?? null,
                },
                { onSuccess: (fault) => setDone({ fault, spare: chosen.asset_tag }) },
              )
            }}
          >
            <Field
              label={`Spare ${category.toLowerCase()} to give them`}
              htmlFor="swap-spare"
              hint={
                chosen
                  ? `Condition: ${labelOf(CONDITION_LABELS, chosen.condition)}. Same person, desk and department, and the accessories move over.`
                  : undefined
              }
            >
              <NativeSelect
                id="swap-spare"
                value={chosen?.id ?? ''}
                onChange={(e) => setSpareId(e.target.value)}
              >
                {spares.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.asset_tag} · {[s.make, s.model].filter(Boolean).join(' ')}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Date" htmlFor="swap-date">
              <Input
                id="swap-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            {faultId ? (
              <p className="text-sm sm:col-span-2">
                The open fault <span className="font-medium">{faultText}</span> stays on{' '}
                {asset.asset_tag}.
              </p>
            ) : (
              <Field label="What's wrong with it" htmlFor="swap-what" className="sm:col-span-2">
                <Input
                  id="swap-what"
                  value={description}
                  autoFocus
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
            )}
            {swap.error && (
              <Alert variant="destructive" className="sm:col-span-2">
                <AlertDescription>{errorMessage(swap.error)}</AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2 sm:col-span-2">
              <Button
                type="submit"
                disabled={!chosen || (!faultId && !description.trim()) || swap.isPending}
              >
                {swap.isPending ? 'Swapping...' : 'Swap'}
              </Button>
              {onDone && (
                <Button type="button" variant="outline" onClick={onDone}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
