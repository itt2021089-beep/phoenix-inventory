import { X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { heldCount, type PersonRow } from '@/features/people/api'

/** Type a few letters of a name (or NID), tap the person. Shows who is picked, with Change. */
export function PersonPicker({
  id,
  label,
  people,
  value,
  onChange,
  emptyText = 'Nobody matches.',
}: {
  id: string
  label: string
  people: PersonRow[]
  value: PersonRow | null
  onChange: (p: PersonRow | null) => void
  emptyText?: string
}) {
  const [q, setQ] = useState('')

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <p className="font-medium">{value.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[
              value.department?.name,
              value.location?.name,
              heldCount(value) ? `holds ${heldCount(value)}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
          <X /> Change
        </Button>
      </div>
    )
  }

  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = people
    .filter((p) => words.every((w) => `${p.full_name} ${p.nid}`.toLowerCase().includes(w)))
    .slice(0, 8)

  return (
    <div className="grid gap-2">
      <Input
        id={id}
        type="search"
        aria-label={label}
        placeholder="Type a name or NID..."
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {(q || people.length <= 8) && (
        <ul className="grid gap-1" role="listbox" aria-label={label}>
          {matches.length === 0 && (
            <li className="px-1 text-sm text-muted-foreground">{emptyText}</li>
          )}
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="w-full rounded-md border px-3 py-2 text-left hover:bg-accent"
                onClick={() => onChange(p)}
              >
                <span className="font-medium">{p.full_name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {[p.department?.name, heldCount(p) ? `holds ${heldCount(p)}` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
