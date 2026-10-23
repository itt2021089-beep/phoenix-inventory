import { useQuery } from '@tanstack/react-query'

import { assetKeys } from '@/features/assets/api'
import { supabase } from '@/lib/supabase'

import type { EquipmentRow } from './equipmentStock'

const EQUIPMENT_SELECT = `
  id, asset_tag, make, model, serial_number, condition, specification,
  purchase_date, purchase_price, invoice_no, warranty_until, category_id,
  category:categories!assets_category_id_fkey ( name ),
  supplier:vendors!assets_supplier_id_fkey ( name )
`

/**
 * Every Spare asset with its purchase details: the equipment side of Stock.
 * Sits under the 'assets' key, so issuing, returning or adding an asset refreshes it.
 */
export function useSpareEquipment() {
  return useQuery({
    queryKey: [...assetKeys.all, 'spare-equipment'] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assets')
        .select(EQUIPMENT_SELECT)
        .eq('status', 'spare')
        .order('asset_tag')
        .returns<EquipmentRow[]>()
      if (error) throw error
      return data ?? []
    },
  })
}
