import { Printer } from 'lucide-react'
import { useParams } from 'react-router'

import { QueryState } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { useHoldings, usePerson } from '@/features/people/api'
import { formatDate, todayInColombo } from '@/lib/format'

import { box } from './handoverForm'
import { clearanceLines, paddedLines } from './clearance'

const cell = 'border border-black px-1.5 py-1 align-top'
const label = 'text-[10px] uppercase tracking-wide text-neutral-600'

/**
 * A4 portrait: everything a leaver still holds, with its accessories, to tick off as it comes
 * back, and signature lines for IT and HR. Viewers (HR) may print it as well.
 */
export function LeaverClearancePrint() {
  const { id } = useParams()
  const person = usePerson(id)
  const holdings = useHoldings(id)
  const p = person.data

  if (!p || !holdings.data) {
    return (
      <div className="p-6">
        <QueryState
          isLoading={person.isLoading || holdings.isLoading}
          error={person.error ?? holdings.error}
        />
        {!person.isLoading && !person.error && !p && (
          <p>
            No such person.{' '}
            <a className="underline" href="/people">
              Back to people
            </a>
          </p>
        )}
      </div>
    )
  }

  const rows = paddedLines(clearanceLines(holdings.data))

  return (
    <div className="bg-neutral-100 print:bg-white">
      <div className="mx-auto flex max-w-[210mm] justify-end gap-2 p-3 print:hidden">
        <Button onClick={() => window.print()}>
          <Printer /> Print or save as PDF
        </Button>
      </div>

      <article className="handover-sheet mx-auto bg-white p-[12mm] text-[12px] leading-snug text-black shadow print:p-0 print:shadow-none">
        <header className="mb-3 flex items-start justify-between border-b-2 border-black pb-2">
          <div>
            <p className="text-lg font-bold tracking-wide">PHOENIX BPO SOLUTIONS</p>
            <p className="text-base font-semibold">IT Clearance: leaving the company</p>
          </div>
          <dl className="text-right text-xs">
            <div>
              <dt className="inline font-semibold">Printed: </dt>
              <dd className="inline">{formatDate(todayInColombo())}</dd>
            </div>
            {p.left_on && (
              <div>
                <dt className="inline font-semibold">Last day: </dt>
                <dd className="inline">{formatDate(p.left_on)}</dd>
              </div>
            )}
          </dl>
        </header>

        <section className="mb-3">
          <h2 className="mb-1 text-sm font-semibold">Employee details</h2>
          <table className="w-full border-collapse">
            <tbody>
              {[
                ['Employee name', p.full_name, 'NID No.', p.nid],
                ['Department', p.department?.name, 'Designation', p.designation],
                ['Contact no.', p.contact_no, '', ''],
              ].map(([l1, v1, l2, v2]) => (
                <tr key={l1}>
                  <td className={`${cell} w-[18%]`}>
                    <span className={label}>{l1}</span>
                  </td>
                  {/* A row with one field (Contact no.) spans the whole width. */}
                  {l2 ? (
                    <>
                      <td className={`${cell} w-[32%]`}>{v1}</td>
                      <td className={`${cell} w-[18%]`}>
                        <span className={label}>{l2}</span>
                      </td>
                      <td className={`${cell} w-[32%] font-mono`}>{v2}</td>
                    </>
                  ) : (
                    <td className={cell} colSpan={3}>
                      {v1}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mb-3">
          <h2 className="mb-1 text-sm font-semibold">
            Equipment held by {p.full_name}
            {holdings.data.length === 0 && ' (none on record)'}
          </h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-neutral-100 print:bg-neutral-100">
                {[
                  '#',
                  'Asset Tag',
                  'Item',
                  'Make / Model',
                  'Serial No.',
                  'Accessories with it',
                  'Returned',
                  'Missing',
                ].map((h) => (
                  <th key={h} className={`${cell} text-left font-semibold`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="h-8">
                  <td className={cell}>{i + 1}</td>
                  <td className={`${cell} font-mono`}>{r?.asset_tag}</td>
                  <td className={cell}>{r?.item}</td>
                  <td className={cell}>{r?.makeModel}</td>
                  <td className={`${cell} font-mono`}>{r?.serial}</td>
                  <td className={cell}>{r?.accessories}</td>
                  <td className={`${cell} text-center`}>{box(false)}</td>
                  <td className={`${cell} text-center`}>{box(false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-neutral-600">
            Tick Returned for each item and its accessories as they come back. Anything not returned
            is Missing and is written below.
          </p>
        </section>

        <section className="mb-3">
          <div className="text-xs">
            <span>Notes / items missing: </span>
            <span className="inline-block min-h-14 w-full border-b border-black" />
          </div>
        </section>

        <section className="mb-3 grid grid-cols-3 gap-2">
          {['Employee', 'IT (received by)', 'HR'].map((title) => (
            <div key={title} className="border border-black p-2">
              <p className="mb-3 text-xs font-semibold">{title}</p>
              {(['Name', 'Signature', 'Date'] as const).map((line) => (
                <div key={line} className="mb-3 flex items-end gap-2 text-xs">
                  <span className="w-16 shrink-0">{line}</span>
                  <span className="flex-1 border-b border-black pb-0.5">
                    {title === 'Employee' && line === 'Name' ? p.full_name : ''}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </section>

        <footer className="border-t border-black pt-1 text-center text-[11px]">
          Original → IT file. Copy → HR file.
        </footer>
      </article>
    </div>
  )
}
