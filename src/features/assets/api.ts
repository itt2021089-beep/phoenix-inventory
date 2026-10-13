import { useQuery } from '@tanstack/react-query'

import type { Json } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export const assetKeys = {
  all: ['assets'] as const,
  list: ['assets', 'list'] as const,
  detail: (tag: string) => ['assets', 'detail', tag] as const,
  timeline: (id: string) => ['assets', 'timeline', id] as const,
  makesModels: ['assets', 'makes-models'] as const,
}

/** Every Phase 1 list query invalidates on any asset change: there are a few hundred rows. */
export const dashboardKeys = { all: ['dashboard'] as const }

const LIST_SELECT = `
  id, asset_tag, make, model, serial_number, status, condition, date_assigned,
  specification, notes, accessories_note, category_id, department_id, location_id,
  assigned_employee_id,
  category:categories!assets_category_id_fkey ( name, tag_prefix ),
  employee:employees!assets_assigned_employee_id_fkey ( full_name, nid ),
  department:departments!assets_department_id_fkey ( name ),
  location:locations!assets_location_id_fkey ( name ),
  asset_accessories ( accessory_types ( name ) )
`

export type AssetListRow = {
  id: string
  asset_tag: string
  make: string | null
  model: string | null
  serial_number: string | null
  status: string
  condition: string
  date_assigned: string | null
  specification: string | null
  notes: string | null
  accessories_note: string | null
  category_id: number
  department_id: number | null
  location_id: number | null
  assigned_employee_id: string | null
  category: { name: string; tag_prefix: string } | null
  employee: { full_name: string; nid: string } | null
  department: { name: string } | null
  location: { name: string } | null
  asset_accessories: { accessory_types: { name: string } | null }[]
}

export function useAssetList() {
  return useQuery({
    queryKey: assetKeys.list,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assets')
        .select(LIST_SELECT)
        .order('asset_tag')
        .returns<AssetListRow[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

export type AssetDetail = AssetListRow & {
  custom_values: Json
  purchase_date: string | null
  purchase_price: number | null
  supplier_id: number | null
  invoice_no: string | null
  warranty_until: string | null
  label_printed_at: string | null
  created_at: string
  updated_at: string | null
  supplier: { name: string } | null
  accessories: { accessory_type_id: number; accessory_types: { name: string } | null }[]
}

export function useAsset(tag: string | undefined) {
  return useQuery({
    queryKey: assetKeys.detail(tag ?? ''),
    enabled: !!tag,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assets')
        .select(
          `${LIST_SELECT},
           custom_values, purchase_date, purchase_price, supplier_id, invoice_no, warranty_until,
           label_printed_at, created_at, updated_at,
           supplier:vendors!assets_supplier_id_fkey ( name ),
           accessories:asset_accessories ( accessory_type_id, accessory_types ( name ) )`,
        )
        .eq('asset_tag', tag!)
        .maybeSingle()
        .overrideTypes<AssetDetail, { merge: false }>()
      if (error) throw error
      return data
    },
  })
}

export type TimelineRow = {
  id: number
  change_no: string
  change_date: string
  change_type: string
  condition: string | null
  accessories: string[]
  accessories_missing: string[]
  reason: string | null
  from_text: string | null
  to_text: string | null
  created_at: string
  from_employee: { full_name: string } | null
  to_employee: { full_name: string } | null
  from_location: { name: string } | null
  to_location: { name: string } | null
  handover_form: { form_no: string } | null
}

/** The asset's Change Log, newest first. */
export function useTimeline(assetId: string | undefined) {
  return useQuery({
    queryKey: assetKeys.timeline(assetId ?? ''),
    enabled: !!assetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('change_log')
        .select(
          `id, change_no, change_date, change_type, condition, accessories, accessories_missing,
           reason, from_text, to_text, created_at,
           from_employee:employees!change_log_from_employee_id_fkey ( full_name ),
           to_employee:employees!change_log_to_employee_id_fkey ( full_name ),
           from_location:locations!change_log_from_location_id_fkey ( name ),
           to_location:locations!change_log_to_location_id_fkey ( name ),
           handover_form:handover_forms!change_log_handover_form_id_fkey ( form_no )`,
        )
        .eq('asset_id', assetId!)
        .order('change_date', { ascending: false })
        .order('id', { ascending: false })
        .returns<TimelineRow[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

/** Makes and models already typed, for autocomplete: pick instead of retyping. */
export function useMakesModels() {
  return useQuery({
    queryKey: assetKeys.makesModels,
    queryFn: async () => {
      const { data, error } = await supabase.from('assets').select('category_id, make, model')
      if (error) throw error
      return data ?? []
    },
  })
}
