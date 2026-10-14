import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  ClipboardList,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Package,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import type { UserRole } from '@/lib/db'

export type NavItem = {
  to: string
  label: string
  /** Shorter label for the phone's bottom bar. */
  short?: string
  icon: LucideIcon
  adminOnly?: boolean
  /** Shows the open-fault count next to it. */
  badge?: 'openFaults'
}

export type NavGroup = { title: string | null; items: NavItem[] }

/**
 * The whole menu, in the order it is shown. Grouped so the daily jobs sit together and the
 * once-a-month pages (reports, import, audit, settings) are out of the way.
 */
export const NAV_GROUPS: NavGroup[] = [
  { title: null, items: [{ to: '/', label: 'Home', icon: LayoutDashboard }] },
  {
    title: 'Daily work',
    items: [
      {
        to: '/issue',
        label: 'Issue / Return',
        short: 'Issue',
        icon: ArrowLeftRight,
        adminOnly: true,
      },
      { to: '/faults', label: 'Faults', icon: Wrench, badge: 'openFaults' },
      { to: '/service', label: 'Service jobs', icon: ClipboardList },
    ],
  },
  {
    title: 'Records',
    items: [
      { to: '/assets', label: 'Assets', icon: Boxes },
      { to: '/people', label: 'People', icon: Users },
      { to: '/stock', label: 'Stock', icon: Package },
    ],
  },
  {
    title: 'Office',
    items: [
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/export', label: 'Import / export', icon: FileSpreadsheet },
      { to: '/audit', label: 'Audit log', icon: History, adminOnly: true },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

/** The menu as this person sees it: admin-only pages left out for a viewer. */
export function navFor(role: UserRole | undefined): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items
      .filter((i) => !i.adminOnly || role === 'admin')
      // A viewer can export but not import.
      .map((i) =>
        i.to === '/export' && role !== 'admin' ? { ...i, label: 'Export to Excel' } : i,
      ),
  })).filter((g) => g.items.length > 0)
}

/**
 * The phone's bottom bar: four pages plus "More". Sahan gets Issue; a viewer, who cannot
 * issue, gets People in that place.
 */
export function phoneBarFor(role: UserRole | undefined): string[] {
  return role === 'admin'
    ? ['/', '/assets', '/issue', '/faults']
    : ['/', '/assets', '/people', '/faults']
}

/** Issue, Return and Transfer are one area; a page's own sub-pages keep its item lit. */
export function isNavActive(to: string, pathname: string): boolean {
  if (to === '/') return pathname === '/'
  if (to === '/issue') return /^\/(issue|return|transfer)(\/|$)/.test(pathname)
  if (to === '/export') return /^\/(export|import)(\/|$)/.test(pathname)
  return pathname === to || pathname.startsWith(`${to}/`)
}
