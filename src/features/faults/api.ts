import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { assetKeys } from '@/features/assets/api'
import { dashboardKeys } from '@/features/dashboard/useDashboard'
import { supabase } from '@/lib/supabase'

export const faultKeys = {
  all: ['faults'] as const,
  list: ['faults', 'list'] as const,
  detail: (no: string) => ['faults', 'detail', no] as const,
  forAsset: (assetId: string) => ['faults', 'asset', assetId] as const,
}

/** No NIDs here: names only (CLAUDE.md, Security and privacy). */
export const FAULT_SELECT = `
  id, fault_no, asset_id, date_reported, source, reported_by_name, description, status,
  action_taken, cost, under_warranty, service_line_id, date_closed, cause, finding_notes,
  remarks, vendor_id, reported_by_employee_id, holder_employee_id, responsible_employee_id,
  created_at, updated_at,
  asset:assets!fault_log_asset_id_fkey ( asset_tag, status, make, model, category:categories!assets_category_id_fkey ( name ) ),
  reporter:employees!fault_log_reported_by_employee_id_fkey ( full_name ),
  holder:employees!fault_log_holder_employee_id_fkey ( full_name ),
  responsible:employees!fault_log_responsible_employee_id_fkey ( full_name ),
  vendor:vendors!fault_log_vendor_id_fkey ( name ),
  service_line:service_lines!fault_log_service_line_id_fkey ( id, cost, job:service_jobs!service_lines_job_id_fkey ( job_no, service_date ) )
`

export type FaultRow = {
  id: number
  fault_no: string
  asset_id: string
  date_reported: string
  source: string
  reported_by_name: string | null
  description: string
  status: string
  action_taken: string | null
  cost: number
  under_warranty: boolean
  service_line_id: number | null
  date_closed: string | null
  cause: string | null
  finding_notes: string | null
  remarks: string | null
  vendor_id: number | null
  reported_by_employee_id: string | null
  holder_employee_id: string | null
  responsible_employee_id: string | null
  created_at: string
  updated_at: string | null
  asset: {
    asset_tag: string
    status: string
    make: string | null
    model: string | null
    category: { name: string } | null
  } | null
  reporter: { full_name: string } | null
  holder: { full_name: string } | null
  responsible: { full_name: string } | null
  vendor: { name: string } | null
  service_line: {
    id: number
    cost: number
    job: { job_no: string; service_date: string } | null
  } | null
}

/** Who told us: a person in the register, or the name typed on the form. */
export const reporterName = (f: FaultRow) => f.reporter?.full_name ?? f.reported_by_name ?? ''

export function useFaults() {
  return useQuery({
    queryKey: faultKeys.list,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fault_log')
        .select(FAULT_SELECT)
        .order('date_reported', { ascending: false })
        .order('id', { ascending: false })
        .returns<FaultRow[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

export function useFault(no: string | undefined) {
  return useQuery({
    queryKey: faultKeys.detail(no ?? ''),
    enabled: !!no,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fault_log')
        .select(FAULT_SELECT)
        .eq('fault_no', no!)
        .maybeSingle()
        .overrideTypes<FaultRow, { merge: false }>()
      if (error) throw error
      return data
    },
  })
}

/** One asset's faults, newest first (its repair history). */
export function useAssetFaults(assetId: string | undefined) {
  return useQuery({
    queryKey: faultKeys.forAsset(assetId ?? ''),
    enabled: !!assetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fault_log')
        .select(FAULT_SELECT)
        .eq('asset_id', assetId!)
        .order('date_reported', { ascending: false })
        .order('id', { ascending: false })
        .returns<FaultRow[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

/** After a fault changes, the faults, the assets (status, repair spend) and the dashboard refresh. */
export function useInvalidateFaults() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: faultKeys.all })
    void qc.invalidateQueries({ queryKey: assetKeys.all })
    void qc.invalidateQueries({ queryKey: dashboardKeys.all })
    void qc.invalidateQueries({ queryKey: ['service'] })
  }
}

/** Open a fault from the asset page. The holder is filled in by the database. */
export function useOpenFault() {
  const invalidate = useInvalidateFaults()
  return useMutation({
    mutationFn: async (args: { assetId: string; description: string; date: string }) => {
      const { data, error } = await supabase
        .from('fault_log')
        .insert({
          asset_id: args.assetId,
          description: args.description,
          date_reported: args.date,
        })
        .select('fault_no')
        .single()
      if (error) throw error
      return data.fault_no
    },
    onSuccess: invalidate,
  })
}

/** One click: "this QR report was from that person". The typed name stays on the record. */
export function useMatchReporter() {
  const invalidate = useInvalidateFaults()
  return useMutation({
    mutationFn: async (args: { id: number; employeeId: string }) => {
      const { error } = await supabase
        .from('fault_log')
        .update({ reported_by_employee_id: args.employeeId })
        .eq('id', args.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export type FaultDetails = {
  status: string
  action_taken: string | null
  vendor_id: number | null
  /** Ignored by the database when the fault is fixed inside a service job. */
  cost: number
  under_warranty: boolean
  date_closed: string | null
  remarks: string | null
}

export function useUpdateFault() {
  const invalidate = useInvalidateFaults()
  return useMutation({
    mutationFn: async (args: { id: number; changes: FaultDetails }) => {
      const { error } = await supabase.from('fault_log').update(args.changes).eq('id', args.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Sahan's finding: kept apart from who reported it and who held it (CLAUDE.md, rule 8). */
export function useSaveFinding() {
  const invalidate = useInvalidateFaults()
  return useMutation({
    mutationFn: async (args: {
      id: number
      cause: string | null
      responsible_employee_id: string | null
      finding_notes: string | null
    }) => {
      const { id, ...finding } = args
      const { error } = await supabase.from('fault_log').update(finding).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSendForRepair() {
  const invalidate = useInvalidateFaults()
  return useMutation({
    mutationFn: async (args: {
      assetId: string
      faultId: number | null
      vendorId: number | null
      date: string
      reason: string
    }) => {
      const { error } = await supabase.rpc('send_for_repair', {
        p_asset_id: args.assetId,
        p_fault_id: args.faultId ?? undefined,
        p_vendor_id: args.vendorId ?? undefined,
        p_date: args.date,
        p_reason: args.reason || undefined,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useBackFromRepair() {
  const invalidate = useInvalidateFaults()
  return useMutation({
    mutationFn: async (args: {
      assetId: string
      condition: string
      nextStatus: 'spare' | 'faulty'
      date: string
      reason: string
    }) => {
      const { error } = await supabase.rpc('back_from_repair', {
        p_asset_id: args.assetId,
        p_condition: args.condition,
        p_next_status: args.nextStatus,
        p_date: args.date,
        p_reason: args.reason || undefined,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
