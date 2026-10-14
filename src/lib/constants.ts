import type {
  AssetStatus,
  CategoryGroup,
  ChangeType,
  Condition,
  LocationKind,
  UserRole,
  VendorKind,
} from './db'

/**
 * Codes stored in the database map to the labels Sahan already uses in Excel, in this one place.
 * The screens and the Excel import/export use the labels; the database only sees the codes.
 */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  viewer: 'Viewer',
}

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  in_use: 'In Use',
  spare: 'Spare',
  under_repair: 'Under Repair',
  faulty: 'Faulty',
  lost_stolen: 'Lost / Stolen',
  retired: 'Retired',
  disposed: 'Disposed',
}

export const CONDITION_LABELS: Record<Condition, string> = {
  new: 'New',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  damaged: 'Damaged',
}

export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  received_new: 'Received (New)',
  issued: 'Issued',
  returned: 'Returned',
  reassigned: 'Reassigned',
  location_changed: 'Location Changed',
  sent_for_repair: 'Sent for Repair',
  back_from_repair: 'Back from Repair',
  upgraded: 'Upgraded',
  part_replaced: 'Part Replaced',
  os_reinstalled: 'OS Reinstalled',
  retired: 'Retired',
  disposed: 'Disposed',
}

export const CATEGORY_GROUP_LABELS: Record<CategoryGroup, string> = {
  it: 'IT',
  facilities: 'Facilities',
}

export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  room: 'Room',
  desk: 'Desk',
  store: 'Store',
  other: 'Other',
}

export const VENDOR_KIND_LABELS: Record<VendorKind, string> = {
  supplier: 'Supplier',
  service: 'Service',
  both: 'Supplier and service',
}

/** Not Retired or Disposed. */
export const ACTIVE_STATUSES: AssetStatus[] = [
  'in_use',
  'spare',
  'under_repair',
  'faulty',
  'lost_stolen',
]

/** A department of null shows as this. */
export const COMMON = 'Common'

/** Dates are shown DD/MM/YYYY and times in Asia/Colombo. */
export const TIME_ZONE = 'Asia/Colombo'

/** Label for a code, falling back to the code itself so nothing ever shows blank. */
export function labelOf<K extends string>(
  labels: Record<K, string>,
  code: string | null | undefined,
) {
  if (!code) return ''
  return (labels as Record<string, string>)[code] ?? code
}
