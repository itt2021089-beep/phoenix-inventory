import { Camera, CheckCircle2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { BrandMark } from '@/components/BrandMark'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { checkPhotoFile, compressPhoto } from '@/lib/photos'
import { supabase } from '@/lib/supabase'

import {
  DESCRIPTION_MAX,
  NAME_MAX,
  publicErrorMessage,
  reportPhotoPath,
  validateReport,
} from './reportForm'

type PublicAsset = {
  asset_tag: string
  category: string
  make: string | null
  model: string | null
}
type Lookup =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'failed' }
  | { state: 'ok'; asset: PublicAsset }

const NAME_KEY = 'phoenix-inventory.reporter-name'
// Storage can be blocked (private windows), and a form must still work without it.
const remembered = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}
const remember = (name: string) => {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    /* not remembering is fine */
  }
}

/**
 * What a staff member sees after scanning a QR label on a phone, without logging in. It shows
 * only the tag, category, make and model (never a name or NID), takes a name, a few words and an
 * optional photo, and ends on the fault number. Kept small and plain: it must open fast on a cheap
 * phone over mobile data.
 */
export function PublicReportPage({ tag }: { tag: string }) {
  const [lookup, setLookup] = useState<Lookup>({ state: 'loading' })
  const [name, setName] = useState(remembered)
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [photoFailed, setPhotoFailed] = useState(false)
  const [sending, setSending] = useState(false)
  const [faultNo, setFaultNo] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let current = true
    void supabase.rpc('get_public_asset', { p_tag: tag }).then(({ data, error }) => {
      if (!current) return
      if (error) setLookup({ state: 'failed' })
      else setLookup(data?.[0] ? { state: 'ok', asset: data[0] } : { state: 'missing' })
    })
    return () => {
      current = false
    }
  }, [tag])

  async function send(withPhoto: boolean) {
    const invalid = validateReport({ name, description })
    setProblem(invalid)
    if (invalid) return
    setSending(true)
    setPhotoFailed(false)
    try {
      let path: string | undefined
      if (withPhoto && photo) {
        try {
          const blob = await compressPhoto(photo)
          path = reportPhotoPath()
          const { error } = await supabase.storage
            .from('photos')
            .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
          if (error) throw error
        } catch {
          // The words are kept; the person chooses to retry or send without the picture.
          setPhotoFailed(true)
          return
        }
      }
      const { data, error } = await supabase.rpc('submit_fault_report', {
        p_tag: tag,
        p_reporter_name: name.trim(),
        p_description: description.trim(),
        p_photo_path: path,
      })
      if (error) {
        setProblem(publicErrorMessage(error))
        return
      }
      remember(name.trim())
      setFaultNo(data)
    } catch (e) {
      setProblem(publicErrorMessage(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header className="flex items-center gap-3">
        <BrandMark className="size-10" />
        <div>
          <p className="text-sm text-muted-foreground">Phoenix BPO · IT</p>
          <h1 className="text-xl font-semibold">Report a problem</h1>
        </div>
      </header>

      {lookup.state === 'loading' && (
        <p role="status" className="py-8 text-center text-muted-foreground">
          Loading...
        </p>
      )}
      {lookup.state === 'failed' && (
        <p role="alert" className="rounded-lg border p-4 text-destructive">
          Could not load this item. Please check your connection and scan again, or tell IT
          directly.
        </p>
      )}
      {lookup.state === 'missing' && (
        <p role="alert" className="rounded-lg border p-4">
          This label is not recognised, or the item is no longer in use. Please tell IT directly.
        </p>
      )}

      {lookup.state === 'ok' && faultNo && (
        <section className="space-y-3 rounded-xl border bg-card p-5 text-center" aria-live="polite">
          <CheckCircle2 className="mx-auto size-10 text-green-600" />
          <h2 className="text-lg font-semibold">Thank you. IT has been told.</h2>
          <p>
            Your report number is <span className="font-mono text-lg font-semibold">{faultNo}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Quote it if you ask IT about this problem.
          </p>
        </section>
      )}

      {lookup.state === 'ok' && !faultNo && (
        <>
          <section aria-label="The item" className="rounded-xl border bg-muted/40 p-4">
            <p className="font-mono text-2xl font-bold">{lookup.asset.asset_tag}</p>
            <p className="text-muted-foreground">
              {[lookup.asset.category, lookup.asset.make, lookup.asset.model]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </section>
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void send(true)
            }}
          >
            <Field label="Your name" htmlFor="reporter-name">
              <Input
                id="reporter-name"
                className="h-11 text-base"
                autoComplete="name"
                maxLength={NAME_MAX}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="What is wrong?" htmlFor="report-what" hint="A few words is enough.">
              <Textarea
                id="report-what"
                className="text-base"
                rows={4}
                maxLength={DESCRIPTION_MAX}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <div className="space-y-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                aria-label="Add a photo"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  const bad = f ? checkPhotoFile(f) : null
                  setProblem(bad)
                  setPhotoFailed(false)
                  setPhoto(bad ? null : f)
                  e.target.value = ''
                }}
              />
              {photo ? (
                <p className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  <span className="truncate">Photo added: {photo.name}</span>
                  <button
                    type="button"
                    aria-label="Remove the photo"
                    className="rounded-full border p-1"
                    onClick={() => {
                      setPhoto(null)
                      setPhotoFailed(false)
                    }}
                  >
                    <X className="size-4" />
                  </button>
                </p>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full"
                  onClick={() => fileInput.current?.click()}
                >
                  <Camera /> Add a photo (optional)
                </Button>
              )}
            </div>
            {problem && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
              >
                {problem}
              </p>
            )}
            {photoFailed && (
              <div
                role="alert"
                className="space-y-2 rounded-lg border border-destructive/40 p-3 text-sm"
              >
                <p className="text-destructive">The photo did not upload.</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={sending}
                    onClick={() => void send(true)}
                  >
                    Try again
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={sending}
                    onClick={() => void send(false)}
                  >
                    Send without the photo
                  </Button>
                </div>
              </div>
            )}
            <Button type="submit" size="lg" className="h-12 text-base" disabled={sending}>
              {sending ? 'Sending...' : 'Send report'}
            </Button>
          </form>
        </>
      )}
    </main>
  )
}
