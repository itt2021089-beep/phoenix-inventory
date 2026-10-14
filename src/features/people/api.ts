import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export const peopleKeys = {
  all: ['people'] as const,
  list: ['people', 'list'] as const,
  detail: (id: string) => ['people', 'detail', id] as const,
  holdings: (id: string) => ['people', 'holdings', id] as const,
}

export type PersonRow = {
  id: string
  full_name: string
  nid: string
  department_id: number | null
  designation: string | null
  contact_no: string | null
  default_location_id: number | null
  status: string
  joined_on: string | null
  left_on: string | null
  notes: string | null
  department: { name: string } | null
  location: { name: string } | null
  held: { count: number }[]
}

const PERSON_SELECT = `
  id, full_name, nid, department_id, designation, contact_no, default_location_id, status,
  joined_on, left_on, notes,
  department:departments!employees_department_id_fkey ( name ),
  location:locations!employees_default_location_id_fkey ( name ),
  held:assets!assets_assigned_employee_id_fkey ( count )
`

export const heldCount = (p: PersonRow) => p.held?.[0]?.count ?? 0

export function usePeople() {
  return useQuery({
    queryKey: peopleKeys.list,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select(PERSON_SELECT)
        .order('full_name')
        .returns<PersonRow[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

export function usePerson(id: string | undefined) {
  return useQuery({
    queryKey: peopleKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select(PERSON_SELECT)
        .eq('id', id!)
        .maybeSingle()
        .overrideTypes<PersonRow, { merge: false }>()
      if (error) throw error
      return data
    },
  })
}

/** An asset someone holds, with the accessories that are with it (ids, for Return). */
export type Holding = {
  id: string
  asset_tag: string
  make: string | null
  model: string | null
  serial_number: string | null
  condition: string
  date_assigned: string | null
  category: { name: string } | null
  location: { name: string } | null
  accessories: { accessory_type_id: number; accessory_types: { name: string } | null }[]
}

export function useHoldings(employeeId: string | undefined) {
  return useQuery({
    queryKey: peopleKeys.holdings(employeeId ?? ''),
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assets')
        .select(
          `id, asset_tag, make, model, serial_number, condition, date_assigned,
           category:categories!assets_category_id_fkey ( name ),
           location:locations!assets_location_id_fkey ( name ),
           accessories:asset_accessories ( accessory_type_id, accessory_types ( name ) )`,
        )
        .eq('assigned_employee_id', employeeId!)
        .order('asset_tag')
        .returns<Holding[]>()
      if (error) throw error
      return data ?? []
    },
  })
}
