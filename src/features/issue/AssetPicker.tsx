import { useState } from 'react'

import { Input } from '@/components/ui/input'
import type { AssetListRow } from '@/features/assets/api'

/** Type part of a tag, serial or model; tap to add. Already-picked assets are left out. */
export function AssetPicker({
  id,
  assets,
  pickedIds,
  onPick,
  kind = 'Spare',
}: {
  id: string
  assets: AssetListRow[]
  pickedIds: string[]
  onPick: (a: AssetListRow) => void
  /** What the list holds, for the wording: 'Spare' on Issue, 'active' elsewhere. */
  kind?: string
}) {
  const [q, setQ] = useState('')
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const available = assets.filter((a) => !pickedIds.includes(a.id))
  const matches = available
    .filter((a) =>
      words.every((w) =>
        [a.asset_tag, a.serial_number, a.make, a.model, a.category?.name]
          .join(' ')
          .toLowerCase()
          .includes(w),
      ),
    )
    .slice(0, 8)

  return (
    <div className="grid gap-2">
      <Input
        id={id}
        type="search"
        aria-label={`Find ${/^[aeiou]/i.test(kind) ? 'an' : 'a'} ${kind} asset`}
        placeholder={`Tag, serial or model (${available.length} ${kind})...`}
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          // A scanned or fully typed tag + Enter adds it straight away.
          if (e.key === 'Enter') {
            e.preventDefault()
            const exact = available.find(
              (a) => a.asset_tag.toLowerCase() === q.trim().toLowerCase(),
            )
            const only = matches.length === 1 ? matches[0] : undefined
            const pick = exact ?? only
            if (pick) {
              onPick(pick)
              setQ('')
            }
          }
        }}
      />
      {q && (
        <ul className="grid gap-1" aria-label={`Matching ${kind} assets`}>
          {matches.length === 0 && (
            <li className="px-1 text-sm text-muted-foreground">No {kind} asset matches.</li>
          )}
          {matches.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="w-full rounded-md border px-3 py-2 text-left hover:bg-accent"
                onClick={() => {
                  onPick(a)
                  setQ('')
                }}
              >
                <span className="font-mono text-sm">{a.asset_tag}</span>
                <span className="ml-2 text-sm">
                  {[a.category?.name, a.make, a.model].filter(Boolean).join(' · ')}
                </span>
                {a.serial_number && (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {a.serial_number}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
