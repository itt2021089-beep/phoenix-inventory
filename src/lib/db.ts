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
 * accepts. Labels for them live in src/lib/constants.ts.
 */
export type UserRole = 'admin' | 'viewer'
export type AssetStatus =
  'in_use' | 'spare' | 'under_repair' | 'faulty' | 'lost_stolen' | 'retired' | 'disposed'
export type Condition = 'new' | 'good' | 'fair' | 'poor' | 'damaged'
export type ChangeType =
  | 'received_new'
  | 'issued'
  | 'returned'
  | 'reassigned'
  | 'location_changed'
  | 'sent_for_repair'
  | 'back_from_repair'
  | 'upgraded'
  | 'part_replaced'
  | 'os_reinstalled'
  | 'retired'
  | 'disposed'
  | 'department_changed'
  | 'status_changed'
  | 'accessories_changed'
export type CategoryGroup = 'it' | 'facilities'
export type VendorKind = 'supplier' | 'service' | 'both'
export type FaultStatus = 'open' | 'in_progress' | 'with_vendor' | 'closed'
export type FaultCause =
  'wear_and_tear' | 'accident' | 'misuse' | 'power_issue' | 'manufacturing_defect' | 'unknown'
export type ServiceJobType = 'cleaning' | 'repair' | 'service' | 'inspection' | 'installation'
export type StockMovementType = 'received' | 'issued' | 'returned' | 'adjusted' | 'written_off'

export type Profile = Omit<Tables<'profiles'>, 'role'> & { role: UserRole }
export type Category = Tables<'categories'>
export type Department = Tables<'departments'>
export type Vendor = Tables<'vendors'>
export type AccessoryType = Tables<'accessory_types'>
export type StockItem = Tables<'stock_items'>

/** One field a category asks for on its assets (categories.custom_fields). */
export type CustomField = {
  key: string
  label: string
  type: 'number' | 'text' | 'date' | 'boolean' | 'select'
  options?: string[]
  required?: boolean
}

const USER_ROLES: readonly string[] = ['admin', 'viewer'] satisfies UserRole[]

export function isUserRole(value: string): value is UserRole {
  return USER_ROLES.includes(value)
}

/** categories.custom_fields as typed fields. Anything malformed is dropped, never trusted. */
export function customFieldsOf(
  category: Pick<Category, 'custom_fields'> | undefined,
): CustomField[] {
  const raw = category?.custom_fields
  if (!Array.isArray(raw)) return []
  return raw.flatMap((f) => {
    if (!f || typeof f !== 'object' || Array.isArray(f)) return []
    const { key, label, type, options, required } = f as Record<string, unknown>
    if (typeof key !== 'string' || !key || typeof label !== 'string') return []
    if (!['number', 'text', 'date', 'boolean', 'select'].includes(type as string)) return []
    return [
      {
        key,
        label,
        type: type as CustomField['type'],
        options: Array.isArray(options) ? options.filter((o) => typeof o === 'string') : undefined,
        required: required === true,
      },
    ]
  })
}
