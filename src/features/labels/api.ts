import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { assetKeys } from '@/features/assets/api'
import { supabase } from '@/lib/supabase'

/** The QR codes for a set of addresses, as inline SVG. qrcode is loaded only on this page. */
export function useQrSvgs(urls: string[]) {
  return useQuery({
    queryKey: ['qr-svgs', ...urls],
    enabled: urls.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const QRCode = (await import('qrcode')).default
      const entries = await Promise.all(
        urls.map(
          async (u) =>
            [
              u,
              await QRCode.toString(u, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }),
            ] as const,
        ),
      )
      return new Map(entries)
    },
  })
}

/** Records that these labels were printed (asset.label_printed_at). Not a movement. */
export function useMarkLabelsPrinted() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (assetIds: string[]) => {
      const { error } = await supabase
        .from('assets')
        .update({ label_printed_at: new Date().toISOString() })
        .in('id', assetIds)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: assetKeys.all }),
  })
}
