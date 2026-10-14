import { Camera, X } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { checkPhotoFile } from '@/lib/photos'

/** One preview link per chosen file, made once and released when the file is removed. */
const previewUrls = new WeakMap<File, string>()
const previewOf = (f: File) => {
  let url = previewUrls.get(f)
  if (!url) previewUrls.set(f, (url = URL.createObjectURL(f)))
  return url
}
function releasePreview(f: File) {
  const url = previewUrls.get(f)
  if (url) URL.revokeObjectURL(url)
  previewUrls.delete(f)
}

/**
 * Choose pictures to attach. On a phone the button opens the camera or the gallery. Nothing is
 * uploaded here: the parent gets the chosen files and decides when to send them.
 */
export function PhotoPicker({
  files,
  onChange,
  max,
  label = 'Add photos',
  disabled,
}: {
  files: File[]
  onChange: (files: File[]) => void
  max: number
  label?: string
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<string | null>(null)
  function choose(list: FileList | null) {
    const picked = Array.from(list ?? [])
    const bad = picked.map(checkPhotoFile).find(Boolean) ?? null
    const good = picked.filter((f) => !checkPhotoFile(f))
    const room = max - files.length
    setProblem(bad ?? (good.length > room ? `You can add up to ${max} photos here.` : null))
    onChange([...files, ...good.slice(0, Math.max(room, 0))])
    if (input.current) input.current.value = ''
  }

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={max > 1}
        hidden
        aria-label={label}
        onChange={(e) => choose(e.target.files)}
      />
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Photos to attach">
          {files.map((f, i) => (
            <li key={previewOf(f)} className="relative">
              <img
                src={previewOf(f)}
                alt={`Photo ${i + 1}`}
                className="size-20 rounded-md border object-cover"
              />
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                className="absolute -top-2 -right-2 rounded-full border bg-background p-0.5"
                onClick={() => {
                  releasePreview(f)
                  onChange(files.filter((_, j) => j !== i))
                }}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || files.length >= max}
        onClick={() => input.current?.click()}
      >
        <Camera /> {label}
        {files.length > 0 ? ` (${files.length}/${max})` : ''}
      </Button>
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
    </div>
  )
}
