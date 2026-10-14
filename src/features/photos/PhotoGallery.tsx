import { QueryState } from '@/components/QueryState'
import { PHOTO_KIND_LABELS } from '@/lib/photos'

import { type PhotoRow, useSignedUrls } from './api'

/** Thumbnails through short-lived signed links. A tap opens the picture full size. */
export function PhotoGallery({
  photos,
  label,
  emptyText,
}: {
  photos: PhotoRow[]
  label: string
  emptyText?: string
}) {
  const urls = useSignedUrls(photos.map((p) => p.storage_path))

  if (photos.length === 0) {
    return emptyText ? <p className="text-sm text-muted-foreground">{emptyText}</p> : null
  }
  return (
    <div>
      <QueryState isLoading={false} error={urls.error} />
      <ul className="flex flex-wrap gap-2" aria-label={label}>
        {photos.map((p) => {
          const url = urls.data?.get(p.storage_path)
          const name = `${PHOTO_KIND_LABELS[p.kind]} photo`
          return (
            <li key={p.id}>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" title={name}>
                  <img
                    src={url}
                    alt={name}
                    loading="lazy"
                    className="size-24 rounded-md border object-cover"
                  />
                </a>
              ) : (
                <div
                  role="img"
                  aria-label={`${name}, loading`}
                  className="size-24 animate-pulse rounded-md border bg-muted"
                />
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
