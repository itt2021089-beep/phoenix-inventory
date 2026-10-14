/**
 * Photo helpers. Photos are compressed in the browser before upload (longest side 1600 px,
 * about 200 KB) and go to the private bucket `photos` (CLAUDE.md, Security and privacy).
 * browser-image-compression is loaded only when a photo is actually chosen.
 */
export const MAX_SIDE_PX = 1600
export const TARGET_MB = 0.2
/** Storage rejects anything above this (the bucket's own limit), so refuse it early. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
/** A condition photo set at issue or return is 1-3 pictures. */
export const MAX_CONDITION_PHOTOS = 3

export type PhotoEntity = 'asset' | 'change_log' | 'fault' | 'handover_form' | 'service_job'
export type PhotoKind =
  'issue' | 'return' | 'damage' | 'signed_form' | 'invoice' | 'asset' | 'report'

/** The first folder of a photo's path, per docs/SCHEMA.md -> Storage. */
export const ENTITY_FOLDERS: Record<PhotoEntity, string> = {
  asset: 'assets',
  change_log: 'changes',
  fault: 'faults',
  handover_form: 'handover',
  service_job: 'service',
}

export const PHOTO_KIND_LABELS: Record<PhotoKind, string> = {
  issue: 'At issue',
  return: 'At return',
  damage: 'Damage',
  signed_form: 'Signed copy',
  invoice: 'Invoice',
  asset: 'Photo',
  report: 'Reported by staff',
}

/** 'changes/CHG-0007/3f9a1c2e-issue.jpg'. Never overwrites: every file gets a new random name. */
export function photoPath(
  entity: PhotoEntity,
  folderKey: string,
  kind: PhotoKind,
  random: string = crypto.randomUUID(),
): string {
  const safeKey = folderKey.replace(/[^A-Za-z0-9_-]/g, '-')
  return `${ENTITY_FOLDERS[entity]}/${safeKey}/${random}-${kind}.jpg`
}

/** Why a chosen file cannot be used, in plain words, or null when it can. */
export function checkPhotoFile(file: { type: string; size: number; name?: string }): string | null {
  if (!file.type.startsWith('image/')) {
    return `${file.name ?? 'That file'} is not a picture.`
  }
  return null
}

/** Resizes and compresses a picture to roughly 1600 px / 200 KB, as a JPEG. */
export async function compressPhoto(file: File): Promise<Blob> {
  const problem = checkPhotoFile(file)
  if (problem) throw new Error(problem)
  const { default: imageCompression } = await import('browser-image-compression')
  const out = await imageCompression(file, {
    maxSizeMB: TARGET_MB,
    maxWidthOrHeight: MAX_SIDE_PX,
    useWebWorker: false,
    fileType: 'image/jpeg',
    initialQuality: 0.8,
  })
  if (out.size > MAX_UPLOAD_BYTES)
    throw new Error(`${file.name} is still too big after shrinking it.`)
  return out
}
