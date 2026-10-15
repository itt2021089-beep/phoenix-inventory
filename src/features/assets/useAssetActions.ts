import { useMutation, useQueryClient } from '@tanstack/react-query'

import { dashboardKeys } from '@/features/dashboard/useDashboard'
import { faultKeys } from '@/features/faults/api'
import { peopleKeys } from '@/features/people/api'
import { supabase } from '@/lib/supabase'

import { assetKeys } from './api'
import type { toAssetUpdate } from './assetForm'

/**
 * After any change to an asset, every list, the asset and the dashboard are refreshed; so are
 * people (retiring clears the holder) and faults (repair moves a fault along).
 */
function useInvalidateAssets() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: assetKeys.all })
    void qc.invalidateQueries({ queryKey: dashboardKeys.all })
    void qc.invalidateQueries({ queryKey: faultKeys.all })
    void qc.invalidateQueries({ queryKey: peopleKeys.all })
  }
}

/** A shared item's department (one someone holds follows that person instead). */
export function useChangeDepartment() {
  const invalidate = useInvalidateAssets()
  return useMutation({
    mutationFn: async (args: {
      assetId: string
      departmentId: number | null
      reason: string
      date: string
    }) => {
      const { error } = await supabase.rpc('change_asset_department', {
        p_asset_id: args.assetId,
        p_department_id: args.departmentId as number,
        p_reason: args.reason || undefined,
        p_date: args.date,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Correct a status (Lost / Stolen, or a wrong one), with a reason, written to the Change Log. */
export function useChangeStatus() {
  const invalidate = useInvalidateAssets()
  return useMutation({
    mutationFn: async (args: { assetId: string; status: string; reason: string; date: string }) => {
      const { error } = await supabase.rpc('change_asset_status', {
        p_asset_id: args.assetId,
        p_status: args.status,
        p_reason: args.reason,
        p_date: args.date,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Correct which accessories are with an item. No stock moves: it is a correction. */
export function useSetAccessories() {
  const invalidate = useInvalidateAssets()
  return useMutation({
    mutationFn: async (args: { assetId: string; accessoryTypeIds: number[] }) => {
      const { error } = await supabase.rpc('set_asset_accessories', {
        p_asset_id: args.assetId,
        p_accessory_type_ids: args.accessoryTypeIds,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useEndOfLife() {
  const invalidate = useInvalidateAssets()
  return useMutation({
    mutationFn: async (args: {
      kind: 'retire' | 'dispose'
      assetId: string
      reason: string
      date: string
    }) => {
      const { error } = await supabase.rpc(
        args.kind === 'retire' ? 'retire_asset' : 'dispose_asset',
        {
          p_asset_id: args.assetId,
          p_reason: args.reason,
          p_date: args.date,
        },
      )
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useUpdateAsset() {
  const invalidate = useInvalidateAssets()
  return useMutation({
    // Only the asset's own details. The guard trigger refuses movement columns anyway.
    mutationFn: async (args: { assetId: string; changes: ReturnType<typeof toAssetUpdate> }) => {
      const { error } = await supabase.from('assets').update(args.changes).eq('id', args.assetId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
