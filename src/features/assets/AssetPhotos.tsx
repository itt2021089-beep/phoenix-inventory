import { QueryState } from '@/components/QueryState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/useAuth'
import { usePhotos, usePhotosFor } from '@/features/photos/api'
import { PhotoGallery } from '@/features/photos/PhotoGallery'
import { PhotoUpload } from '@/features/photos/PhotoUpload'
import { formatDate } from '@/lib/format'
import { MAX_CONDITION_PHOTOS } from '@/lib/photos'

import type { TimelineRow } from './api'

/** The newest Change Log row of a type (the timeline is newest first). */
const latestOf = (rows: TimelineRow[], type: 'issued' | 'returned') =>
  rows.find((r) => r.change_type === type)

/**
 * "At issue" next to "At return": the condition photos of the newest issue and the newest
 * return, so damage shows at a glance. Plus the asset's own photos.
 */
export function AssetPhotos({ assetId, timeline }: { assetId: string; timeline: TimelineRow[] }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const issued = latestOf(timeline, 'issued')
  const returned = latestOf(timeline, 'returned')
  const ids = [issued, returned].filter((r): r is TimelineRow => !!r).map((r) => String(r.id))
  const conditionPhotos = usePhotosFor('change_log', ids)
  const own = usePhotos('asset', assetId)

  const columns = [
    { title: 'At issue', row: issued, kind: 'issue' as const },
    { title: 'At return', row: returned, kind: 'return' as const },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Photos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <QueryState
          isLoading={conditionPhotos.isLoading || own.isLoading}
          error={conditionPhotos.error ?? own.error}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {columns.map(({ title, row, kind }) => {
            const photos = (conditionPhotos.data ?? []).filter(
              (p) => p.entity_id === String(row?.id),
            )
            return (
              <section key={title} aria-label={title} className="space-y-2 rounded-lg border p-3">
                <h3 className="text-sm font-medium">
                  {title}
                  {row && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      {formatDate(row.change_date)} · {row.change_no}
                    </span>
                  )}
                </h3>
                {!row ? (
                  <p className="text-sm text-muted-foreground">
                    Not {kind === 'issue' ? 'issued' : 'returned'} yet.
                  </p>
                ) : (
                  <>
                    <PhotoGallery
                      photos={photos}
                      label={`${title} photos`}
                      emptyText="No photos taken."
                    />
                    {isAdmin && (
                      <PhotoUpload
                        target={{
                          entity: 'change_log',
                          entityId: String(row.id),
                          folderKey: row.change_no,
                          kind,
                        }}
                        max={MAX_CONDITION_PHOTOS}
                        label={`Add ${title.toLowerCase()} photos`}
                      />
                    )}
                  </>
                )}
              </section>
            )
          })}
        </div>
        <section aria-label="Other photos" className="space-y-2">
          <h3 className="text-sm font-medium">Other photos</h3>
          <PhotoGallery photos={own.data ?? []} label="Asset photos" emptyText="None yet." />
          {isAdmin && (
            <PhotoUpload
              target={{ entity: 'asset', entityId: assetId, folderKey: assetId, kind: 'asset' }}
              label="Add a photo of the asset"
            />
          )}
        </section>
      </CardContent>
    </Card>
  )
}
