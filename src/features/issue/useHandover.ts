import { useMutation, useQueryClient } from '@tanstack/react-query'

import { assetKeys } from '@/features/assets/api'
import { dashboardKeys } from '@/features/dashboard/useDashboard'
import { faultKeys } from '@/features/faults/api'
import { lookupKeys } from '@/features/lookups/useLookups'
import { peopleKeys } from '@/features/people/api'
import { stockKeys } from '@/features/stock/api'
import type { Json } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

/**
 * Every hand-over changes assets, people's holdings and the dashboard. A ticked accessory also
 * moves stock, and a return can open a fault, so those lists are refreshed too.
 */
function useRefreshAll() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: assetKeys.all })
    void qc.invalidateQueries({ queryKey: peopleKeys.all })
    void qc.invalidateQueries({ queryKey: dashboardKeys.all })
    void qc.invalidateQueries({ queryKey: faultKeys.all })
    void qc.invalidateQueries({ queryKey: stockKeys.all })
    void qc.invalidateQueries({ queryKey: lookupKeys.stockItems })
  }
}

export function useIssue() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: async (a: {
      employeeId: string
      items: Json
      locationId: number | null
      date: string
      reason: string
      makeForm: boolean
    }) => {
      const { data, error } = await supabase.rpc('issue_assets', {
        p_employee_id: a.employeeId,
        p_items: a.items,
        p_location_id: (a.locationId ?? undefined) as number,
        p_issue_date: a.date,
        p_reason: a.reason || undefined,
        p_make_form: a.makeForm,
      })
      if (error) throw error
      return data as string | null
    },
    onSuccess: refresh,
  })
}

export function useReturn() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: async (a: {
      items: Json
      returnCondition: string
      dataBackedUp: string
      remarks: string
      makeForm: boolean
      date: string
      locationId: number | null
    }) => {
      const { data, error } = await supabase.rpc('return_assets', {
        p_items: a.items,
        p_return_condition: a.returnCondition,
        p_data_backed_up: a.dataBackedUp || undefined,
        p_remarks: a.remarks || undefined,
        p_make_form: a.makeForm,
        p_return_date: a.date,
        p_location_id: (a.locationId ?? undefined) as number,
      })
      if (error) throw error
      return data as string | null
    },
    onSuccess: refresh,
  })
}

export function useTransfer() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: async (a: {
      fromId: string
      toId: string
      assetIds: string[]
      makeForm: boolean
      date: string
      reason: string
    }) => {
      const { data, error } = await supabase.rpc('transfer_assets', {
        p_from_employee_id: a.fromId,
        p_to_employee_id: a.toId,
        p_asset_ids: a.assetIds,
        p_make_form: a.makeForm,
        p_transfer_date: a.date,
        p_reason: a.reason || undefined,
      })
      if (error) throw error
      return data as string | null
    },
    onSuccess: refresh,
  })
}
