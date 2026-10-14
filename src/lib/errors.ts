/** Unique constraints whose database wording means nothing to Sahan. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  assets_serial_ci: 'That serial number is already on another asset.',
  locations_name_ci: 'There is already a location with that name.',
  employees_nid_key: 'Someone already has that NID.',
  departments_name_key: 'There is already a department with that name.',
  categories_name_key: 'There is already a category with that name.',
  categories_tag_prefix_key: 'Another category already uses that prefix.',
  vendors_name_key: 'There is already a vendor with that name.',
  accessory_types_name_key: 'There is already an accessory with that name.',
}

/**
 * The readable part of an error. Only `message` is ever shown, never Postgres's `details`, which
 * can quote the offending value (an NID must never appear in an error message).
 */
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message)
    // The browser's words for "no connection" mean nothing to most people.
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
      return 'Could not reach the server. Check the internet connection and try again.'
    }
    const constraint = /unique constraint "([^"]+)"/.exec(message)?.[1]
    return (constraint && CONSTRAINT_MESSAGES[constraint]) || message
  }
  return 'Something went wrong. Please try again.'
}
