import { useMutation, useQueryClient } from '@tanstack/react-query'

import { dashboardKeys } from '@/features/dashboard/useDashboard'
import { supabase } from '@/lib/supabase'

import { assetKeys } from './api'
import type { toAssetUpdate } from './assetForm'

/** After any change to an asset, every list, the asset and the dashboard are refreshed. */
function useInvalidateAssets() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: assetKeys.all })
    void qc.invalidateQueries({ queryKey: dashboardKeys.all })
  }
}

export function useMoveAsset() {
  const invalidate = useInvalidateAssets()
  return useMutation({
    mutationFn: async (args: {
      assetId: string
      locationId: number | null
      departmentId: number | null
      reason: string
      date: string
    }) => {
      const { error } = await supabase.rpc('move_asset', {
        p_asset_id: args.assetId,
        p_location_id: args.locationId as number,
        p_department_id: args.departmentId as number,
        p_reason: args.reason || undefined,
        p_move_date: args.date,
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
