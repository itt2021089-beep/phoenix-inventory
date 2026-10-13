/**
 * App-level names for database types.
 *
 * src/lib/database.types.ts is GENERATED (`npm run gen:types`) and overwritten every time, so
 * nothing hand-written may live in it. Anything the app needs on top of it goes here.
 */
import type { Tables } from './database.types'

/**
 * Codes are stored as text with a CHECK constraint, not as Postgres enums (docs/SCHEMA.md), so
 * the generated types see plain `string`. These unions narrow them to the codes the database
 * accepts.
 */
export type UserRole = 'admin' | 'viewer'

export type Profile = Omit<Tables<'profiles'>, 'role'> & { role: UserRole }

const USER_ROLES: readonly string[] = ['admin', 'viewer'] satisfies UserRole[]

export function isUserRole(value: string): value is UserRole {
  return USER_ROLES.includes(value)
}
