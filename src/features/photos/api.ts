import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { compressPhoto, type PhotoEntity, type PhotoKind, photoPath } from '@/lib/photos'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export const photoKeys = {
  all: ['photos'] as const,
  forEntity: (entity: PhotoEntity, id: string) => ['photos', 'entity', entity, id] as const,
  signed: (paths: string[]) => ['photos', 'signed', ...paths] as const,
}

export type PhotoRow = {
  id: number
  entity_type: PhotoEntity
  entity_id: string
  kind: PhotoKind
  storage_path: string
  created_at: string
}

const SELECT = 'id, entity_type, entity_id, kind, storage_path, created_at'

/** The photos of one thing (an asset, a Change Log row, a fault...), oldest first. */
export function usePhotos(entity: PhotoEntity, entityId: string | undefined) {
  return useQuery({
    queryKey: photoKeys.forEntity(entity, entityId ?? ''),
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('photos')
        .select(SELECT)
        .eq('entity_type', entity)
        .eq('entity_id', entityId!)
        .order('id')
        .returns<PhotoRow[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

/** Photos of many things of one kind at once (e.g. every Change Log row of an asset). */
export function usePhotosFor(entity: PhotoEntity, entityIds: string[]) {
  const key = [...entityIds].sort()
  return useQuery({
    queryKey: ['photos', 'many', entity, ...key],
    enabled: key.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('photos')
        .select(SELECT)
        .eq('entity_type', entity)
        .in('entity_id', key)
        .order('id')
        .returns<PhotoRow[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

/** How long a signed link lives. Short on purpose: it is a key to a private photo. */
export const SIGNED_URL_SECONDS = 300

/** Short-lived links for a set of stored photos. Re-fetched before they would expire. */
export function useSignedUrls(paths: string[]) {
  return useQuery({
    queryKey: photoKeys.signed(paths),
    enabled: paths.length > 0,
    staleTime: (SIGNED_URL_SECONDS - 60) * 1000,
    gcTime: SIGNED_URL_SECONDS * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('photos')
        .createSignedUrls(paths, SIGNED_URL_SECONDS)
      if (error) throw error
      return new Map((data ?? []).map((d) => [d.path ?? '', d.signedUrl]))
    },
  })
}

export type UploadTarget = {
  entity: PhotoEntity
  /** The row's id, as stored in photos.entity_id. */
  entityId: string
  /** The folder name: the asset id, or the CHG / FLT / HO / SRV number. */
  folderKey: string
  kind: PhotoKind
}

/**
 * Compresses each picture, uploads it under a new random name, then records what it is a photo
 * of. If the row cannot be saved, the file is left unlinked rather than overwritten or removed
 * (nothing in the bucket is ever deleted).
 */
export async function uploadPhotos(files: File[], target: UploadTarget): Promise<number> {
  let done = 0
  for (const file of files) {
    const blob = await compressPhoto(file)
    const path = photoPath(target.entity, target.folderKey, target.kind)
    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
    if (uploadError) throw uploadError
    const { error } = await supabase.from('photos').insert({
      entity_type: target.entity,
      entity_id: target.entityId,
      kind: target.kind,
      storage_path: path,
    })
    if (error) throw error
    done++
  }
  return done
}

export function useUploadPhotos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ files, target }: { files: File[]; target: UploadTarget }) =>
      uploadPhotos(files, target),
    onSettled: () => void qc.invalidateQueries({ queryKey: photoKeys.all }),
  })
}

/**
 * Condition photos taken at issue or return belong to the Change Log row that action just
 * wrote. The action returns only the form number, so the newest row of that type for each
 * asset is looked up. Returns a plain-words problem, or null when everything was saved. The
 * issue or return itself has already happened either way.
 */
export async function attachConditionPhotos(
  items: { assetId: string; files: File[] }[],
  changeType: 'issued' | 'returned',
): Promise<string | null> {
  const kind: PhotoKind = changeType === 'issued' ? 'issue' : 'return'
  const problems: string[] = []
  for (const item of items.filter((i) => i.files.length > 0)) {
    try {
      const { data, error } = await supabase
        .from('change_log')
        .select('id, change_no')
        .eq('asset_id', item.assetId)
        .eq('change_type', changeType)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Could not find the Change Log row to attach them to.')
      await uploadPhotos(item.files, {
        entity: 'change_log',
        entityId: String(data.id),
        folderKey: data.change_no,
        kind,
      })
    } catch (e) {
      problems.push(errorMessage(e))
    }
  }
  return problems.length ? [...new Set(problems)].join(' ') : null
}
