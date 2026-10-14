import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

import type { AuditRow } from './auditLog'

export const PAGE_SIZE = 50

export type AuditFilters = {
  table: string
  action: string
  user: string
  /** YYYY-MM-DD, Colombo days */
  from: string
  to: string
}
export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  table: '',
  action: '',
  user: '',
  from: '',
  to: '',
}

/** Newest first, a page at a time: the next page is everything older than the last row seen. */
export function useAuditLog(f: AuditFilters) {
  return useInfiniteQuery({
    queryKey: ['audit', f],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('audit_log')
        .select('id, table_name, record_id, action, old_data, new_data, user_id, at')
        .order('id', { ascending: false })
        .limit(PAGE_SIZE)
      if (pageParam !== null) q = q.lt('id', pageParam)
      if (f.table) q = q.eq('table_name', f.table)
      if (f.action) q = q.eq('action', f.action)
      if (f.user) q = q.eq('user_id', f.user)
      // Days are Colombo days: +05:30 all year (Sri Lanka has no daylight saving).
      if (f.from) q = q.gte('at', `${f.from}T00:00:00+05:30`)
      if (f.to) q = q.lte('at', `${f.to}T23:59:59.999+05:30`)
      const { data, error } = await q.returns<AuditRow[]>()
      if (error) throw error
      return data ?? []
    },
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last[last.length - 1].id : undefined),
  })
}

/** Who each user id is, for the Who column and the filter. */
export function useAccounts() {
  return useQuery({
    queryKey: ['audit', 'accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, role')
      if (error) throw error
      return data ?? []
    },
  })
}
