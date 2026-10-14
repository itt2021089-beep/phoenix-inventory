import { useQuery } from '@tanstack/react-query'

import type { Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export const dashboardKeys = { all: ['dashboard'] as const }

export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: async () => {
      const [totals, categories, departments, due, flagged, faults, stock, settings] =
        await Promise.all([
          supabase.from('v_dashboard').select('*').maybeSingle(),
          supabase.from('v_category_summary').select('*').order('category'),
          supabase.from('v_department_summary').select('*'),
          supabase.from('v_due_soon').select('*').order('due_date'),
          supabase.from('v_asset_costs').select('*').eq('flagged', true),
          supabase.from('v_open_faults').select('*').order('age_days', { ascending: false }),
          supabase.from('v_stock_levels').select('*').eq('needs_reorder', true).order('item_code'),
          supabase
            .from('settings')
            .select('key, value')
            .in('key', ['reminder_window_days', 'repeat_fault_months']),
        ])
      for (const r of [totals, categories, departments, due, flagged, faults, stock, settings])
        if (r.error) throw r.error
      const setting = (key: string, fallback: number) => {
        const v = settings.data?.find((s) => s.key === key)?.value
        return typeof v === 'number' ? v : fallback
      }
      return {
        due: (due.data ?? []) as Tables<'v_due_soon'>[],
        flagged: (flagged.data ?? []) as Tables<'v_asset_costs'>[],
        openFaults: (faults.data ?? []) as Tables<'v_open_faults'>[],
        stockToReorder: (stock.data ?? []) as Tables<'v_stock_levels'>[],
        windowDays: setting('reminder_window_days', 30),
        repeatMonths: setting('repeat_fault_months', 12),
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
