import { QueryState } from '@/components/QueryState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/useAuth'
import { usePhotos } from '@/features/photos/api'
import { PhotoGallery } from '@/features/photos/PhotoGallery'
import { PhotoUpload } from '@/features/photos/PhotoUpload'

/**
 * The asset's own photos. (Condition photos at issue and return were dropped to keep those
 * screens quick; any taken before stay in Storage and the photos table.)
 */
export function AssetPhotos({ assetId }: { assetId: string }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const own = usePhotos('asset', assetId)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Photos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <QueryState isLoading={own.isLoading} error={own.error} />
        <PhotoGallery photos={own.data ?? []} label="Asset photos" emptyText="None yet." />
        {isAdmin && (
          <PhotoUpload
            target={{ entity: 'asset', entityId: assetId, folderKey: assetId, kind: 'asset' }}
            label="Add a photo of the asset"
          />
        )}
      </CardContent>
    </Card>
  )
}
