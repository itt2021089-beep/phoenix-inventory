import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { assetKeys } from '@/features/assets/api'
import { dashboardKeys } from '@/features/dashboard/useDashboard'
import { faultKeys } from '@/features/faults/api'
import { supabase } from '@/lib/supabase'

import { type ServiceHeaderDraft, type ServiceLineDraft, toRpcArgs } from './serviceForm'

export const serviceKeys = {
  all: ['service'] as const,
  list: ['service', 'list'] as const,
  detail: (no: string) => ['service', 'detail', no] as const,
  forAsset: (assetId: string) => ['service', 'asset', assetId] as const,
}

export type ServiceLineRow = {
  id: number
  asset_id: string
  work_done: string
  cost: number
  next_due_date: string | null
  notes: string | null
  asset: {
    asset_tag: string
    make: string | null
    model: string | null
    category: { name: string } | null
    department: { name: string } | null
  } | null
  faults: { fault_no: string }[]
}

export type ServiceJobRow = {
  id: number
  job_no: string
  job_type: string
  service_date: string
  invoice_no: string | null
  invoice_total: number | null
  notes: string | null
  vendor: { name: string } | null
  lines: ServiceLineRow[]
}

export const JOB_SELECT = `
  id, job_no, job_type, service_date, invoice_no, invoice_total, notes,
  vendor:vendors!service_jobs_vendor_id_fkey ( name ),
  lines:service_lines!service_lines_job_id_fkey (
    id, asset_id, work_done, cost, next_due_date, notes,
    asset:assets!service_lines_asset_id_fkey (
      asset_tag, make, model,
      category:categories!assets_category_id_fkey ( name ),
      department:departments!assets_department_id_fkey ( name )
    ),
    faults:fault_log!fault_log_service_line_id_fkey ( fault_no )
  )
`

export function useServiceJobs() {
  return useQuery({
    queryKey: serviceKeys.list,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_jobs')
        .select(JOB_SELECT)
        .order('service_date', { ascending: false })
        .order('id', { ascending: false })
        .returns<ServiceJobRow[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

export function useServiceJob(no: string | undefined) {
  return useQuery({
    queryKey: serviceKeys.detail(no ?? ''),
    enabled: !!no,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_jobs')
        .select(JOB_SELECT)
        .eq('job_no', no!)
        .maybeSingle()
        .overrideTypes<ServiceJobRow, { merge: false }>()
      if (error) throw error
      return data
    },
  })
}

/** One asset's service history: its lines, with the job each belongs to. */
export type AssetServiceRow = {
  id: number
  work_done: string
  cost: number
  next_due_date: string | null
  job: {
    job_no: string
    job_type: string
    service_date: string
    vendor: { name: string } | null
  } | null
}

export function useAssetService(assetId: string | undefined) {
  return useQuery({
    queryKey: serviceKeys.forAsset(assetId ?? ''),
    enabled: !!assetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_lines')
        .select(
          `id, work_done, cost, next_due_date,
           job:service_jobs!service_lines_job_id_fkey (
             job_no, job_type, service_date, vendor:vendors!service_jobs_vendor_id_fkey ( name ) )`,
        )
        .eq('asset_id', assetId!)
        .returns<AssetServiceRow[]>()
      if (error) throw error
      return (data ?? []).sort((a, b) =>
        (b.job?.service_date ?? '').localeCompare(a.job?.service_date ?? ''),
      )
    },
  })
}

export function useRecordServiceJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { header: ServiceHeaderDraft; lines: ServiceLineDraft[] }) => {
      const { data, error } = await supabase.rpc(
        'record_service_job',
        toRpcArgs(args.header, args.lines),
      )
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: serviceKeys.all })
      void qc.invalidateQueries({ queryKey: faultKeys.all })
      void qc.invalidateQueries({ queryKey: assetKeys.all })
      void qc.invalidateQueries({ queryKey: dashboardKeys.all })
    },
  })
}
