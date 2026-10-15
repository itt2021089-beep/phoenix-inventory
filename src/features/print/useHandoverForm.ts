import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

type Person = {
  full_name: string
  nid: string
  designation: string | null
  contact_no: string | null
  department: { name: string } | null
}

export type HandoverFormData = {
  id: number
  form_no: string
  form_date: string
  purpose: 'issue' | 'return' | 'transfer'
  return_condition: string | null
  data_backed_up: string | null
  remarks: string | null
  created_by: string | null
  employee: Person | null
  from_employee: { full_name: string } | null
  rows: {
    condition: string | null
    accessories: string[]
    accessories_missing: string[]
    asset: {
      asset_tag: string
      make: string | null
      model: string | null
      serial_number: string | null
      category: { name: string } | null
    } | null
  }[]
  itName: string | null
}

const PERSON = `full_name, nid, designation, contact_no,
  department:departments!employees_department_id_fkey ( name )`

export function useHandoverForm(formNo: string | undefined) {
  return useQuery({
    queryKey: ['handover-form', formNo],
    enabled: !!formNo,
    queryFn: async (): Promise<HandoverFormData | null> => {
      const { data: form, error } = await supabase
        .from('handover_forms')
        .select(
          `id, form_no, form_date, purpose, return_condition, data_backed_up, remarks, created_by,
           employee:employees!handover_forms_employee_id_fkey ( ${PERSON} ),
           from_employee:employees!handover_forms_from_employee_id_fkey ( full_name )`,
        )
        .eq('form_no', formNo!)
        .maybeSingle()
        .overrideTypes<Omit<HandoverFormData, 'rows' | 'itName'>, { merge: false }>()
      if (error) throw error
      if (!form) return null

      const [rows, it] = await Promise.all([
        supabase
          .from('change_log')
          .select(
            `condition, accessories, accessories_missing,
             asset:assets!change_log_asset_id_fkey ( asset_tag, make, model, serial_number,
               category:categories!assets_category_id_fkey ( name ) )`,
          )
          .eq('handover_form_id', form.id)
          .returns<HandoverFormData['rows']>(),
        form.created_by
          ? supabase.from('profiles').select('full_name').eq('id', form.created_by).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
      if (rows.error) throw rows.error
      return { ...form, rows: rows.data ?? [], itName: it.data?.full_name ?? null }
    },
  })
}
