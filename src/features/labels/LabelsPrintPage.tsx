import { ArrowLeft, Printer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { Field } from '@/components/Field'
import { QueryState } from '@/components/QueryState'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { type AssetListRow, useAssetList } from '@/features/assets/api'
import { useCategories } from '@/features/lookups/useLookups'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'

import { useMarkLabelsPrinted, useQrSvgs } from './api'
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  DEFAULT_LABEL_SETTINGS,
  type LabelSettings,
  paginate,
  qrUrl,
  sheetGrid,
  validateSettings,
} from './labelSheet'

const SETTINGS_KEY = 'phoenix-inventory.label-settings'

/** Label size is a property of the sticker sheets in this office's printer, so it is remembered here. */
function loadSettings(): LabelSettings {
  try {
    const saved = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) ?? 'null',
    ) as Partial<LabelSettings> | null
    return { ...DEFAULT_LABEL_SETTINGS, ...saved, startAt: 1 }
  } catch {
    return DEFAULT_LABEL_SETTINGS
  }
}

const isActive = (a: AssetListRow) => a.status !== 'retired' && a.status !== 'disposed'

export function LabelsPrintPage() {
  const assets = useAssetList()
  const [params] = useSearchParams()
  if (!assets.data) {
    return (
      <div className="p-6">
        <QueryState isLoading={assets.isLoading} error={assets.error} />
      </div>
    )
  }
  // ?tags=A,B arrives from the asset page; ?unprinted=1 starts with every label not yet printed.
  const wanted = new Set((params.get('tags') ?? '').split(',').filter(Boolean))
  const start = assets.data
    .filter(isActive)
    .filter(
      (a) => wanted.has(a.asset_tag) || (params.get('unprinted') === '1' && !a.label_printed_at),
    )
    .map((a) => a.id)
  return <LabelsForm assets={assets.data.filter(isActive)} initiallyTicked={start} />
}

function LabelsForm({
  assets,
  initiallyTicked,
}: {
  assets: AssetListRow[]
  initiallyTicked: string[]
}) {
  const categories = useCategories()
  const mark = useMarkLabelsPrinted()
  const [ticked, setTicked] = useState<Set<string>>(new Set(initiallyTicked))
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [settings, setSettings] = useState<LabelSettings>(loadSettings)
  const [afterPrint, setAfterPrint] = useState(false)

  // The browser tells us when the print dialog closes; that is when to offer "mark as printed",
  // so a cancelled or failed print does not record labels that never came out.
  useEffect(() => {
    const done = () => setAfterPrint(true)
    window.addEventListener('afterprint', done)
    return () => window.removeEventListener('afterprint', done)
  }, [])

  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = assets.filter(
    (a) =>
      (!category || String(a.category_id) === category) &&
      words.every((w) =>
        [a.asset_tag, a.make, a.model, a.category?.name].join(' ').toLowerCase().includes(w),
      ),
  )
  const chosen = useMemo(() => assets.filter((a) => ticked.has(a.id)), [assets, ticked])
  const problem = validateSettings(settings)
  const pages = useMemo(
    () => (problem ? [] : paginate(chosen, settings)),
    [chosen, settings, problem],
  )
  const grid = sheetGrid(settings)
  const base = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined
  const urls = chosen.map((a) => qrUrl(a.asset_tag, base, window.location.origin))
  const qr = useQrSvgs(urls)
  const unprinted = assets.filter((a) => !a.label_printed_at)

  function setNum(key: keyof LabelSettings, value: string) {
    const next = { ...settings, [key]: value === '' ? Number.NaN : Number(value) }
    setSettings(next)
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...next, startAt: 1 }))
    } catch {
      /* not remembering is fine */
    }
  }
  const toggle = (id: string) =>
    setTicked((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const tickAll = (list: AssetListRow[]) =>
    setTicked((cur) => new Set([...cur, ...list.map((a) => a.id)]))

  return (
    <div className="bg-neutral-100 print:bg-white">
      {/* The sheet is printed edge to edge; its own margin is set below (CLAUDE.md: no PDF library). */}
      <style>{`@page { size: A4 portrait; margin: 0 }`}</style>

      <div className="mx-auto max-w-5xl space-y-4 p-4 print:hidden">
        <Link
          to="/assets"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Assets
        </Link>
        <h1 className="text-xl font-semibold">Print QR labels</h1>

        <section aria-label="Choose labels" className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="font-medium">1. Which assets?</h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => tickAll(unprinted)}>
              Tick all without a printed label ({unprinted.length})
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => tickAll(shown)}>
              Tick all shown ({shown.length})
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!ticked.size}
              onClick={() => setTicked(new Set())}
            >
              Clear
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              type="search"
              aria-label="Search"
              placeholder="Search tag, make, model..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <NativeSelect
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <ul
            aria-label="Assets"
            className="grid max-h-72 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2"
          >
            {shown.length === 0 && (
              <li className="p-2 text-sm text-muted-foreground">No assets match.</li>
            )}
            {shown.map((a) => (
              <li key={a.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={ticked.has(a.id)}
                    onChange={() => toggle(a.id)}
                  />
                  <span className="font-mono">{a.asset_tag}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {[a.make, a.model].filter(Boolean).join(' ')}
                  </span>
                  {a.label_printed_at ? (
                    <span className="text-xs text-muted-foreground">
                      printed {formatDate(a.label_printed_at)}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-700 dark:text-amber-400">not printed</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Label size" className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="font-medium">2. Label size and sheet</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Label width (mm)" htmlFor="label-w">
              <Input
                id="label-w"
                inputMode="decimal"
                value={Number.isNaN(settings.widthMm) ? '' : settings.widthMm}
                onChange={(e) => setNum('widthMm', e.target.value)}
              />
            </Field>
            <Field label="Label height (mm)" htmlFor="label-h">
              <Input
                id="label-h"
                inputMode="decimal"
                value={Number.isNaN(settings.heightMm) ? '' : settings.heightMm}
                onChange={(e) => setNum('heightMm', e.target.value)}
              />
            </Field>
            <Field label="Sheet margin (mm)" htmlFor="label-m">
              <Input
                id="label-m"
                inputMode="decimal"
                value={Number.isNaN(settings.marginMm) ? '' : settings.marginMm}
                onChange={(e) => setNum('marginMm', e.target.value)}
              />
            </Field>
            <Field
              label="Start at label no."
              htmlFor="label-start"
              hint={
                grid.perPage
                  ? `Skip used labels on a part-used sheet (1 to ${grid.perPage}).`
                  : undefined
              }
            >
              <Input
                id="label-start"
                inputMode="numeric"
                value={Number.isNaN(settings.startAt) ? '' : settings.startAt}
                onChange={(e) => setNum('startAt', e.target.value)}
              />
            </Field>
          </div>
          <p className="text-sm text-muted-foreground">
            {problem ??
              `${grid.cols} across, ${grid.rows} down: ${grid.perPage} labels on an A4 sheet.`}
          </p>
        </section>

        <section aria-label="Print" className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            disabled={!chosen.length || !!problem || qr.isLoading}
            onClick={() => {
              setAfterPrint(false)
              window.print()
            }}
          >
            <Printer /> Print {chosen.length} label{chosen.length === 1 ? '' : 's'}
            {pages.length > 1 ? ` on ${pages.length} sheets` : ''}
          </Button>
          <span className="text-sm text-muted-foreground">
            In the print window choose A4, scale 100%, and no headers or footers.
          </span>
        </section>
        {qr.error && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(qr.error)}</AlertDescription>
          </Alert>
        )}
        {afterPrint && chosen.length > 0 && (
          <Alert role="status">
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>Did they print properly?</span>
              <Button
                size="sm"
                disabled={mark.isPending || mark.isSuccess}
                onClick={() => mark.mutate(chosen.map((a) => a.id))}
              >
                {mark.isSuccess ? 'Marked as printed' : `Mark ${chosen.length} as printed`}
              </Button>
              {mark.error && <span className="text-destructive">{errorMessage(mark.error)}</span>}
            </AlertDescription>
          </Alert>
        )}
        <h2 className="pt-2 font-medium">Preview</h2>
      </div>

      <div className="flex flex-col items-center gap-4 pb-8 print:block print:gap-0 print:pb-0">
        {pages.map((page, i) => (
          <section
            key={i}
            aria-label={`Sheet ${i + 1}`}
            className="label-page relative bg-white shadow print:shadow-none"
            style={{
              width: `${A4_WIDTH_MM}mm`,
              height: `${A4_HEIGHT_MM}mm`,
              padding: `${settings.marginMm}mm`,
              boxSizing: 'border-box',
              breakAfter: i < pages.length - 1 ? 'page' : 'auto',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${grid.cols}, ${settings.widthMm}mm)`,
                gridAutoRows: `${settings.heightMm}mm`,
              }}
            >
              {page.map((a, j) =>
                a ? (
                  <Label
                    key={a.id}
                    asset={a}
                    svg={qr.data?.get(qrUrl(a.asset_tag, base, window.location.origin))}
                  />
                ) : (
                  <div key={`skip-${j}`} />
                ),
              )}
            </div>
          </section>
        ))}
        {pages.length === 0 && (
          <p className="py-10 text-sm text-muted-foreground print:hidden">
            {problem
              ? 'Fix the label size to see the sheet.'
              : 'Tick some assets to see the labels.'}
          </p>
        )}
      </div>
    </div>
  )
}

/** One label: the QR on the left, the tag large and bold beside it. Tag only; no names. */
function Label({ asset, svg }: { asset: AssetListRow; svg: string | undefined }) {
  return (
    <div
      className="flex items-center gap-[1.5mm] overflow-hidden border border-dashed border-neutral-300 p-[1.5mm] text-black print:border-transparent"
      style={{ breakInside: 'avoid' }}
    >
      <div
        className="aspect-square h-full shrink-0 [&>svg]:size-full"
        aria-label={`QR code for ${asset.asset_tag}`}
        role="img"
        // The SVG is produced by the qrcode library from the address above, never from user text.
        dangerouslySetInnerHTML={{ __html: svg ?? '' }}
      />
      <div className="min-w-0 leading-tight">
        <p className="font-mono text-[9pt] font-bold whitespace-nowrap">{asset.asset_tag}</p>
        <p className="text-[7pt]">Phoenix BPO · IT</p>
        <p className="text-[7pt]">Scan to report a problem</p>
      </div>
    </div>
  )
}
