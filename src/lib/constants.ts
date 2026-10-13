import type { UserRole } from './db'

/**
 * Codes stored in the database map to the labels Sahan already uses, in this one place.
 * The rest of the lists (asset status, condition, change type, ...) arrive with Phase 1.
 */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  viewer: 'Viewer',
}

/** Dates are shown DD/MM/YYYY and times in Asia/Colombo. */
export const TIME_ZONE = 'Asia/Colombo'
