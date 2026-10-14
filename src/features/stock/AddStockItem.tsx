import { useState } from 'react'
import { useNavigate } from 'react-router'

import { Field } from '@/components/Field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/errors'

import { useAddStockItem } from './api'

/** A new consumable. It starts at 0: what is on the shelf is then recorded with Receive. */
export function AddStockItem({ onDone }: { onDone: () => void }) {
  const add = useAddStockItem()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('pcs')
  const [reorder, setReorder] = useState('')
  const [notes, setNotes] = useState('')
  const reorderLevel = reorder.trim() === '' ? 0 : Number(reorder)
  const badReorder = !Number.isInteger(reorderLevel) || reorderLevel < 0

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Add stock item</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate(
              {
                name: name.trim(),
                unit: unit.trim() || 'pcs',
                reorder_level: reorderLevel,
                notes: notes.trim() || null,
              },
              // Straight to its page, where the first delivery is recorded.
              { onSuccess: (code) => navigate(`/stock/${code}?action=received`) },
            )
          }}
        >
          <Field label="Item" htmlFor="new-stock-name">
            <Input
              id="new-stock-name"
              placeholder="e.g. HDMI cable"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Unit" htmlFor="new-stock-unit">
            <Input id="new-stock-unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </Field>
          <Field
            label="Reorder when down to"
            htmlFor="new-stock-reorder"
            error={badReorder ? 'Enter a whole number of 0 or more.' : undefined}
            hint="The list flags it when stock reaches this. 0 means never."
          >
            <Input
              id="new-stock-reorder"
              inputMode="numeric"
              value={reorder}
              onChange={(e) => setReorder(e.target.value)}
            />
          </Field>
          <Field label="Notes" htmlFor="new-stock-notes">
            <Input id="new-stock-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {add.error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{errorMessage(add.error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={!name.trim() || badReorder || add.isPending}>
              {add.isPending ? 'Saving...' : 'Add item'}
            </Button>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
