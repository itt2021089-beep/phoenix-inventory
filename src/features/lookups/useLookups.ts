import { useQuery } from '@tanstack/react-query'

import type { AccessoryType, Category, Department, StockItem, Vendor } from '@/lib/db'
import { supabase } from '@/lib/supabase'

/**
 * The short reference lists every screen picks from. Small, rarely changed, so they are fetched
 * once and shared; Settings invalidates them after an edit.
 */
export const lookupKeys = {
  all: ['lookups'] as const,
  categories: ['lookups', 'categories'] as const,
  departments: ['lookups', 'departments'] as const,
  vendors: ['lookups', 'vendors'] as const,
  accessoryTypes: ['lookups', 'accessory_types'] as const,
  stockItems: ['lookups', 'stock_items'] as const,
}

const LONG = 5 * 60_000

async function rows<T>(promise: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await promise
  if (error) throw error
  return data ?? []
}

export const useCategories = () =>
  useQuery({
    queryKey: lookupKeys.categories,
    staleTime: LONG,
    queryFn: () =>
      rows<Category>(supabase.from('categories').select('*').order('category_group').order('name')),
  })

export const useDepartments = () =>
  useQuery({
    queryKey: lookupKeys.departments,
    staleTime: LONG,
    queryFn: () => rows<Department>(supabase.from('departments').select('*').order('name')),
  })

export const useVendors = () =>
  useQuery({
    queryKey: lookupKeys.vendors,
    staleTime: LONG,
    queryFn: () => rows<Vendor>(supabase.from('vendors').select('*').order('name')),
  })

export const useAccessoryTypes = () =>
  useQuery({
    queryKey: lookupKeys.accessoryTypes,
    staleTime: LONG,
    queryFn: () => rows<AccessoryType>(supabase.from('accessory_types').select('*').order('name')),
  })

export const useStockItems = () =>
  useQuery({
    queryKey: lookupKeys.stockItems,
    staleTime: LONG,
    queryFn: () => rows<StockItem>(supabase.from('stock_items').select('*').order('name')),
  })

/** Only rows still in use, plus the one already chosen (so an old choice still shows). */
export function activeOr<T extends { id: number; is_active: boolean }>(
  list: T[] | undefined,
  current?: number | null,
): T[] {
  return (list ?? []).filter((x) => x.is_active || x.id === current)
}
