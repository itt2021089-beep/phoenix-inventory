import { useQuery } from '@tanstack/react-query'

import type { Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export const dashboardKeys = { all: ['dashboard'] as const }

export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: async () => {
      const [totals, categories, departments] = await Promise.all([
        supabase.from('v_dashboard').select('*').maybeSingle(),
        supabase.from('v_category_summary').select('*').order('category'),
        supabase.from('v_department_summary').select('*'),
      ])
      for (const r of [totals, categories, departments]) if (r.error) throw r.error
      return {
        totals: totals.data as Tables<'v_dashboard'> | null,
        categories: (categories.data ?? []) as Tables<'v_category_summary'>[],
        departments: (departments.data ?? []) as Tables<'v_department_summary'>[],
      }
    },
  })
}

/** Department x category counts as a grid: departments down, categories across. */
export function departmentGrid(rows: Tables<'v_department_summary'>[]) {
  const categories = [...new Set(rows.map((r) => r.category ?? ''))].sort()
  const departments = [...new Set(rows.map((r) => r.department ?? 'Common'))].sort((a, b) =>
    // Common last, the five departments alphabetically before it.
    a === 'Common' ? 1 : b === 'Common' ? -1 : a.localeCompare(b),
  )
  const cell = (dep: string, cat: string) =>
    rows
      .filter((r) => (r.department ?? 'Common') === dep && r.category === cat)
      .reduce((n, r) => n + (r.active_total ?? 0), 0)
  const idOf = (dep: string) =>
    rows.find((r) => (r.department ?? 'Common') === dep)?.department_id ?? null
  return { categories, departments, cell, idOf }
}
