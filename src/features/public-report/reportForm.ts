/**
 * Rules for the public report form. They mirror what submit_fault_report checks (name 1-80,
 * description 5-1000), so a phone gets the answer instantly instead of after a round trip.
 * The database checks again: nothing here is trusted.
 */
export const NAME_MAX = 80
export const DESCRIPTION_MIN = 5
export const DESCRIPTION_MAX = 1000

/** The tag from /a/<tag>, or null if the path is not one. */
export function tagFromPath(pathname: string): string | null {
  const m = /^\/a\/([^/]+)\/?$/.exec(pathname)
  if (!m) return null
  try {
    return decodeURIComponent(m[1]).trim() || null
  } catch {
    return null
  }
}

export type ReportDraft = { name: string; description: string }

/** What is wrong with the form, in plain words, or null when it can be sent. */
export function validateReport(d: ReportDraft): string | null {
  const name = d.name.trim()
  const what = d.description.trim()
  if (!name) return 'Please enter your name.'
  if (name.length > NAME_MAX) return `Your name is too long (up to ${NAME_MAX} characters).`
  if (what.length < DESCRIPTION_MIN) return 'Please say what is wrong (a few words is enough).'
  if (what.length > DESCRIPTION_MAX)
    return `That is too long (up to ${DESCRIPTION_MAX} characters). Please shorten it.`
  return null
}

/** A random name for the photo, in the only shape the bucket accepts from a logged-out phone. */
export const reportPhotoPath = (id: string = crypto.randomUUID()) => `reports/${id}.jpg`

/**
 * An error from the server, shown to a member of staff. Messages the database wrote for staff
 * are plain sentences and pass through; anything else (a network failure, a server error)
 * becomes one friendly line, so no technical detail or data is ever shown.
 */
export function publicErrorMessage(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : ''
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  // 22023 (a bad input) and PT429 (too many reports) are the codes submit_fault_report raises
  // its own sentences with.
  if ((code === '22023' || code === 'PT429') && message) return message
  return 'Sorry, that did not go through. Please check your connection and try again, or tell IT directly.'
}
