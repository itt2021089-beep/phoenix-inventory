import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
import { PHOTO_KIND_LABELS } from '@/lib/photos'

import { type UploadTarget, useUploadPhotos } from './api'
import { PhotoPicker } from './PhotoPicker'

/** Pick pictures and send them in one go: the "Add photos" control for an existing row. */
export function PhotoUpload({
  target,
  max = 5,
  label,
}: {
  target: UploadTarget
  max?: number
  label?: string
}) {
  const upload = useUploadPhotos()
  const [files, setFiles] = useState<File[]>([])

  return (
    <div className="space-y-2">
      <PhotoPicker
        files={files}
        onChange={setFiles}
        max={max}
        label={label ?? `Add ${PHOTO_KIND_LABELS[target.kind].toLowerCase()} photos`}
        disabled={upload.isPending}
      />
      {files.length > 0 && (
        <Button
          type="button"
          size="sm"
          disabled={upload.isPending}
          onClick={() => upload.mutate({ files, target }, { onSuccess: () => setFiles([]) })}
        >
          {upload.isPending ? 'Uploading...' : `Upload ${files.length}`}
        </Button>
      )}
      {upload.error && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(upload.error)}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
