import { useQuery } from '@tanstack/react-query'

import { QueryState } from '@/components/QueryState'
import { useAuth } from '@/features/auth/useAuth'
import { supabase } from '@/lib/supabase'

import { usePhotos } from './api'
import { PhotoGallery } from './PhotoGallery'
import { PhotoUpload } from './PhotoUpload'

/** The signed paper copy of a handover form, photographed and filed under its HO number. */
export function SignedCopy({ formNo }: { formNo: string }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const form = useQuery({
    queryKey: ['handover-form-id', formNo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('handover_forms')
        .select('id')
        .eq('form_no', formNo)
        .maybeSingle()
      if (error) throw error
      return data?.id ?? null
    },
  })
  const formId = form.data === null || form.data === undefined ? undefined : String(form.data)
  const photos = usePhotos('handover_form', formId)

  return (
    <div className="space-y-2">
      <QueryState isLoading={false} error={form.error ?? photos.error} />
      <PhotoGallery photos={photos.data ?? []} label={`Signed copy of ${formNo}`} />
      {isAdmin && formId && (
        <PhotoUpload
          target={{
            entity: 'handover_form',
            entityId: formId,
            folderKey: formNo,
            kind: 'signed_form',
          }}
          max={3}
          label="Photograph the signed copy"
        />
      )}
    </div>
  )
}
