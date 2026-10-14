import { useMutation } from '@tanstack/react-query'

import type { AssetListRow } from '@/features/assets/api'
import { FAULT_SELECT, type FaultRow } from '@/features/faults/api'
import { JOB_SELECT, type ServiceJobRow } from '@/features/service/api'
import { downloadWorkbook, exportFileName } from '@/lib/excel'
import { todayInColombo } from '@/lib/format'
import { supabase } from '@/lib/supabase'

import {
  buildSheets,
  type CategorySummaryRow,
  type ChangeLogExportRow,
  type DashboardCounts,
  type StockRow,
} from './exportWorkbook'

const ASSET_SELECT = `
  id, asset_tag, make, model, serial_number, status, condition, date_assigned, specification,
  notes, accessories_note, category_id, department_id, location_id, assigned_employee_id,
  category:categories!assets_category_id_fkey ( name, tag_prefix ),
  employee:employees!assets_assigned_employee_id_fkey ( full_name, nid ),
  department:departments!assets_department_id_fkey ( name ),
  location:locations!assets_location_id_fkey ( name ),
  asset_accessories ( accessory_type_id, accessory_types ( name ) )
`

const CHANGE_SELECT = `
  id, change_no, change_date, change_type, condition, accessories, accessories_missing, reason,
  from_text, to_text, created_at,
  asset:assets!change_log_asset_id_fkey ( asset_tag ),
  from_employee:employees!change_log_from_employee_id_fkey ( full_name ),
  to_employee:employees!change_log_to_employee_id_fkey ( full_name ),
  from_location:locations!change_log_from_location_id_fkey ( name ),
  to_location:locations!change_log_to_location_id_fkey ( name ),
  handover_form:handover_forms!change_log_handover_form_id_fkey ( form_no )
`

/** The whole workbook, as one download. Everything the viewer can read, nothing more. */
export function useExportWorkbook() {
  return useMutation({
    mutationFn: async () => {
      const [assets, changes, faults, jobs, stock, totals, categories] = await Promise.all([
        supabase.from('assets').select(ASSET_SELECT).order('asset_tag').returns<AssetListRow[]>(),
        supabase
          .from('change_log')
          .select(CHANGE_SELECT)
          .order('id')
          .returns<ChangeLogExportRow[]>(),
        supabase
          .from('fault_log')
          .select(FAULT_SELECT)
          .order('date_reported', { ascending: false })
          .order('id', { ascending: false })
          .returns<FaultRow[]>(),
        supabase
          .from('service_jobs')
          .select(JOB_SELECT)
          .order('service_date', { ascending: false })
          .order('id', { ascending: false })
          .returns<ServiceJobRow[]>(),
        supabase
          .from('stock_items')
          .select('item_code, name, qty_on_hand, reorder_level, notes')
          .order('item_code')
          .returns<StockRow[]>(),
        supabase.from('v_dashboard').select('*').maybeSingle(),
        supabase
          .from('v_category_summary')
          .select('category, active_total, in_use, spare, min_spares, below_min')
          .order('category')
          .returns<CategorySummaryRow[]>(),
      ])
      for (const r of [assets, changes, faults, jobs, stock, totals, categories])
        if (r.error) throw r.error

      await downloadWorkbook(
        exportFileName('IT_Asset_Inventory_Phoenix_BPO', todayInColombo()),
        buildSheets({
          assets: assets.data ?? [],
          changes: changes.data ?? [],
          faults: faults.data ?? [],
          jobs: jobs.data ?? [],
          stock: stock.data ?? [],
          totals: (totals.data ?? null) as DashboardCounts | null,
          categories: categories.data ?? [],
        }),
      )
    },
  })
}
