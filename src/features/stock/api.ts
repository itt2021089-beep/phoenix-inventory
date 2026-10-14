import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { lookupKeys } from '@/features/lookups/useLookups'
import type { StockItem } from '@/lib/db'
import { supabase } from '@/lib/supabase'

import { type MovementDraft, type MovementRow, toMovementInsert } from './stockForm'

export const stockKeys = {
  all: ['stock'] as const,
  items: ['stock', 'items'] as const,
  movements: ['stock', 'movements'] as const,
}

export const MOVEMENT_SELECT = `
  id, stock_item_id, movement_date, movement_type, qty_change, unit_cost, reference, notes,
  created_at,
  employee:employees!stock_movements_employee_id_fkey ( full_name ),
  department:departments!stock_movements_department_id_fkey ( name ),
  vendor:vendors!stock_movements_vendor_id_fkey ( name ),
  change:change_log!stock_movements_change_log_id_fkey (
    change_no, asset:assets!change_log_asset_id_fkey ( asset_tag ) )
`

export function useStockList() {
  return useQuery({
    queryKey: stockKeys.items,
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_items').select('*').order('item_code')
      if (error) throw error
      return (data ?? []) as StockItem[]
    },
  })
}

/** Every movement, newest first. Small: a few hundred rows a year at most. */
export function useMovements() {
  return useQuery({
    queryKey: stockKeys.movements,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select(MOVEMENT_SELECT)
        .order('movement_date', { ascending: false })
        .order('id', { ascending: false })
        .returns<MovementRow[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

function useRefreshStock() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: stockKeys.all })
    // The Settings page and the accessory pickers read the same items.
    void qc.invalidateQueries({ queryKey: lookupKeys.stockItems })
  }
}

/** Receive, issue, adjust or write off. The database updates the quantity and refuses < 0. */
export function useRecordMovement() {
  const refresh = useRefreshStock()
  return useMutation({
    mutationFn: async (args: { stockItemId: number; draft: MovementDraft }) => {
      const { error } = await supabase
        .from('stock_movements')
        .insert(toMovementInsert(args.stockItemId, args.draft))
      if (error) throw error
    },
    onSuccess: refresh,
  })
}

/** A new item starts at 0; what is on the shelf is then recorded with Receive. */
export function useAddStockItem() {
  const refresh = useRefreshStock()
  return useMutation({
    mutationFn: async (item: {
      name: string
      unit: string
      reorder_level: number
      notes: string | null
    }) => {
      const { data, error } = await supabase
        .from('stock_items')
        .insert(item)
        .select('item_code')
        .single()
      if (error) throw error
      return data.item_code
    },
    onSuccess: refresh,
  })
}

export function useUpdateStockItem() {
  const refresh = useRefreshStock()
  return useMutation({
    mutationFn: async (args: {
      id: number
      changes: {
        name: string
        unit: string
        reorder_level: number
        notes: string | null
        is_active: boolean
      }
    }) => {
      const { error } = await supabase.from('stock_items').update(args.changes).eq('id', args.id)
      if (error) throw error
    },
    onSuccess: refresh,
  })
}
