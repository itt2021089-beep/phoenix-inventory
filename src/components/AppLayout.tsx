import {
  ArrowLeftRight,
  Boxes,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router'

import { useAuth } from '@/features/auth/useAuth'
import { USER_ROLE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'

import { Badge } from './ui/badge'
import { Button } from './ui/button'

type NavItem = {
  to: string
  label: string
  /** Shorter label for the phone's bottom bar. */
  short?: string
  icon: LucideIcon
  adminOnly?: boolean
  /** Left off the phone's five-slot bottom bar (still in the sidebar). */
  desktopOnly?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/assets', label: 'Assets', icon: Boxes },
  { to: '/issue', label: 'Issue / Return', short: 'Issue', icon: ArrowLeftRight, adminOnly: true },
  { to: '/people', label: 'People', icon: Users },
  { to: '/faults', label: 'Faults', icon: Wrench, desktopOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings },
]

/** Sidebar on a desktop, bottom nav on a phone. */
export function AppLayout() {
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const nav = NAV.filter((n) => !n.adminOnly || profile?.role === 'admin')
  const phoneNav = nav.filter((n) => !n.desktopOnly)
  // Issue, Return and Transfer are one area: keep the item lit on all three.
  const isActiveFor = (to: string, active: boolean) =>
    to === '/issue' ? active || /^\/(return|transfer)/.test(pathname) : active

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r bg-card md:flex md:flex-col">
        <div className="border-b px-4 py-4">
          <p className="font-semibold">Phoenix Inventory</p>
          <p className="text-xs text-muted-foreground">Phoenix BPO Solutions</p>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm',
                  isActiveFor(to, isActive)
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2 border-t p-4">
          {profile && (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm" title={profile.full_name}>
                {profile.full_name}
              </span>
              <Badge variant="secondary">{USER_ROLE_LABELS[profile.role]}</Badge>
            </div>
          )}
          <Button variant="outline" size="sm" className="w-full" onClick={() => void signOut()}>
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone header: the role badge and sign-out live here instead of the sidebar. */}
        <header className="flex items-center justify-between gap-2 border-b bg-card px-4 py-3 md:hidden">
          <p className="truncate font-semibold">Phoenix Inventory</p>
          <div className="flex items-center gap-2">
            {profile && <Badge variant="secondary">{USER_ROLE_LABELS[profile.role]}</Badge>}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={() => void signOut()}
            >
              <LogOut className="size-4" aria-hidden />
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 pb-20 md:p-6 md:pb-6">
          <Outlet />
        </main>

        {/* Phone bottom nav */}
        <nav
          className="fixed inset-x-0 bottom-0 grid border-t bg-card md:hidden"
          style={{ gridTemplateColumns: `repeat(${phoneNav.length}, minmax(0, 1fr))` }}
        >
          {phoneNav.map(({ to, label, short, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 px-1 py-2 text-[11px]',
                  isActiveFor(to, isActive) ? 'text-foreground' : 'text-muted-foreground',
                )
              }
            >
              <Icon className="size-5" aria-hidden />
              {short ?? label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
