import { Printer } from 'lucide-react'
import { useParams } from 'react-router'

import { QueryState } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { SignedCopy } from '@/features/photos/SignedCopy'
import { formatDate } from '@/lib/format'

import { ACKNOWLEDGEMENT, box, formLines, padRows } from './handoverForm'
import { useHandoverForm } from './useHandoverForm'

const cell = 'border border-black px-1.5 py-1 align-top'
const label = 'text-[10px] uppercase tracking-wide text-neutral-600'

function SignatureColumn({ title, name }: { title: string; name?: string | null }) {
  return (
    <div className="border border-black p-2">
      <p className="mb-3 text-xs font-semibold">{title}</p>
      {(['Name', 'Signature', 'Date'] as const).map((line) => (
        <div key={line} className="mb-3 flex items-end gap-2 text-xs">
          <span className="w-16 shrink-0">{line}</span>
          <span className="flex-1 border-b border-black pb-0.5">
            {line === 'Name' ? (name ?? '') : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

/** A4 portrait, matching the paper IT Equipment Handover Form (docs/BUILD_PLAN.md). */
export function HandoverFormPrint() {
  const { formNo } = useParams()
  const { data: f, isLoading, error } = useHandoverForm(formNo)

  if (!f) {
    return (
      <div className="p-6">
        <QueryState isLoading={isLoading} error={error} />
        {!isLoading && !error && <p>No handover form {formNo}.</p>}
      </div>
    )
  }

  const lines = formLines(f.rows)
  const missing = f.rows.flatMap((r) =>
    r.accessories_missing.map((a) => `${a} (${r.asset?.asset_tag})`),
  )
  const isReturn = f.purpose === 'return'
  // The Return screen already writes "Missing: ..." into the remarks; add it only if absent.
  const returnRemarks = !isReturn
    ? ''
    : [
        f.remarks,
        missing.length && !f.remarks?.includes('Missing:') ? `Missing: ${missing.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('. ')
  const e = f.employee

  return (
    <div className="bg-neutral-100 print:bg-white">
      <div className="mx-auto flex max-w-[210mm] justify-end gap-2 p-3 print:hidden">
        <Button onClick={() => window.print()}>
          <Printer /> Print or save as PDF
        </Button>
      </div>

      <article className="handover-sheet mx-auto bg-white p-[12mm] text-[12px] leading-snug text-black shadow print:p-0 print:shadow-none">
        {/* 1. Header */}
        <header className="mb-3 flex items-start justify-between border-b-2 border-black pb-2">
          <div>
            <p className="text-lg font-bold tracking-wide">PHOENIX BPO SOLUTIONS</p>
            <p className="text-base font-semibold">IT Equipment Handover Form</p>
          </div>
          <dl className="text-right text-xs">
            <div>
              <dt className="inline font-semibold">Form No: </dt>
              <dd className="inline font-mono">{f.form_no}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Date: </dt>
              <dd className="inline">{formatDate(f.form_date)}</dd>
            </div>
          </dl>
        </header>

        {/* 2. Purpose */}
        <section className="mb-3 flex flex-wrap gap-x-6 text-sm">
          <span className="font-semibold">Purpose:</span>
          <span>{box(f.purpose === 'issue')} Issue to employee</span>
          <span>{box(isReturn)} Return to IT</span>
          <span>{box(f.purpose === 'transfer')} Transfer to another employee</span>
        </section>

        {/* 3. Employee details */}
        <section className="mb-3">
          <h2 className="mb-1 text-sm font-semibold">Employee details</h2>
          <table className="w-full border-collapse">
            <tbody>
              {[
                ['Employee name', e?.full_name, 'NID No.', e?.nid],
                ['Department', e?.department?.name, 'Designation', e?.designation],
                ['Location / desk', e?.location?.name, 'Contact no.', e?.contact_no],
              ].map(([l1, v1, l2, v2]) => (
                <tr key={l1}>
                  <td className={`${cell} w-[18%]`}>
                    <span className={label}>{l1}</span>
                  </td>
                  <td className={`${cell} w-[32%]`}>{v1}</td>
                  <td className={`${cell} w-[18%]`}>
                    <span className={label}>{l2}</span>
                  </td>
                  <td className={`${cell} w-[32%] font-mono`}>{v2}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {f.from_employee && (
            <p className="mt-1 text-xs">
              Transferred from: <span className="font-medium">{f.from_employee.full_name}</span>
            </p>
          )}
        </section>

        {/* 4. Equipment */}
        <section className="mb-3">
          <h2 className="mb-1 text-sm font-semibold">Equipment</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-neutral-100 print:bg-neutral-100">
                {[
                  '#',
                  'Asset Tag',
                  'Item',
                  'Make / Model',
                  'Serial No.',
                  'Condition',
                  'Accessories included',
                ].map((h) => (
                  <th key={h} className={`${cell} text-left text-[11px] font-semibold`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {padRows(lines).map((l, i) => (
                <tr key={i} className="h-7">
                  <td className={`${cell} w-6 text-center`}>{i + 1}</td>
                  <td className={`${cell} font-mono whitespace-nowrap`}>{l?.asset_tag}</td>
                  <td className={cell}>{l?.item}</td>
                  <td className={cell}>{l?.makeModel}</td>
                  <td className={`${cell} font-mono text-[11px]`}>{l?.serial}</td>
                  <td className={cell}>{l?.condition}</td>
                  <td className={cell}>{l?.accessories}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 5. Acknowledgement, exactly as written */}
        <section className="mb-3">
          <h2 className="mb-1 text-sm font-semibold">Employee acknowledgement</h2>
          <ul className="list-disc space-y-0.5 pl-5 text-[11.5px]">
            {ACKNOWLEDGEMENT.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        {/* 6. On return: IT use only */}
        <section className="mb-3 border border-black p-2">
          <h2 className="mb-1 text-sm font-semibold">On return: IT use only</h2>
          <p className="text-xs">
            Condition on return: {box(isReturn && f.return_condition === 'good')} Good{'   '}
            <span className="ml-3">
              {box(isReturn && f.return_condition === 'damaged')} Damaged
            </span>
            <span className="ml-3">
              {box(isReturn && f.return_condition === 'items_missing')} Items missing
            </span>
          </p>
          <p className="text-xs">
            Data backed up / device reset: {box(isReturn && f.data_backed_up === 'yes')} Yes
            <span className="ml-3">
              {box(isReturn && f.data_backed_up === 'not_needed')} Not needed
            </span>
          </p>
          <div className="mt-1 text-xs">
            <span>Remarks / missing items: </span>
            <span className="inline-block min-h-8 w-full border-b border-black">
              {returnRemarks}
            </span>
          </div>
        </section>

        {/* 7. Signatures */}
        <section className="mb-3 grid grid-cols-3 gap-2">
          <SignatureColumn title="Employee" name={e?.full_name} />
          <SignatureColumn title="IT (issued / received by)" name={f.itName} />
          <SignatureColumn title="Head of Department" />
        </section>

        {/* 8. Footer */}
        <footer className="border-t border-black pt-1 text-center text-[11px]">
          Original → IT file. Copy → employee.
        </footer>
      </article>

      {/* Screen only: the signed paper copy, once someone has photographed it. */}
      <section className="mx-auto max-w-[210mm] p-3 print:hidden" aria-label="Signed copy">
        <h2 className="mb-2 text-sm font-medium">Signed copy</h2>
        <SignedCopy formNo={f.form_no} />
      </section>
    </div>
  )
}
