import { LogOut, Menu } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router'

import { useAuth } from '@/features/auth/useAuth'
import { useNavCounts } from '@/features/dashboard/useDashboard'
import { USER_ROLE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'

import { isNavActive, navFor, phoneBarFor, type NavItem } from './nav'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

/** A small red count, e.g. open faults. Nothing when it is 0. */
function CountBadge({ n, className }: { n: number | undefined; className?: string }) {
  if (!n) return null
  return (
    <span
      className={cn(
        'rounded-full bg-destructive px-1.5 text-[11px] leading-[18px] font-medium text-destructive-foreground tabular-nums',
        className,
      )}
    >
      {n}
    </span>
  )
}

/** Sidebar on a desktop, bottom bar on a phone. */
export function AppLayout() {
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const counts = useNavCounts()
  const groups = navFor(profile?.role)
  const all = groups.flatMap((g) => g.items)
  const phoneBar = phoneBarFor(profile?.role)
    .map((to) => all.find((i) => i.to === to))
    .filter((i): i is NavItem => !!i)
  const countFor = (i: NavItem) => (i.badge === 'openFaults' ? counts.data?.openFaults : undefined)
  // "More" is lit for every page that is not on the bar itself.
  const moreActive = pathname === '/more' || !phoneBar.some((i) => isNavActive(i.to, pathname))

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 border-r bg-card md:flex md:flex-col">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            P
          </span>
          <div className="min-w-0">
            <p className="truncate leading-tight font-semibold">Phoenix Inventory</p>
            <p className="truncate text-xs text-muted-foreground">Phoenix BPO Solutions</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {groups.map((g) => (
            <div key={g.title ?? 'top'} className="mb-3">
              {g.title && (
                <p className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {g.title}
                </p>
              )}
              {g.items.map((item) => {
                const Icon = item.icon
                const active = isNavActive(item.to, pathname)
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm',
                      active
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    <CountBadge n={countFor(item)} />
                  </NavLink>
                )
              })}
            </div>
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
        {/* Phone header: the role badge and sign-out live on the More page instead. */}
        <header className="flex items-center gap-2 border-b bg-card px-4 py-3 md:hidden">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            P
          </span>
          <p className="truncate font-semibold">Phoenix Inventory</p>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 pb-24 md:p-6 md:pb-8">
          <Outlet />
        </main>

        {/* Phone bottom bar: the four most used pages, and More for the rest. */}
        <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t bg-card md:hidden">
          {phoneBar.map((item) => {
            const Icon = item.icon
            const active = isNavActive(item.to, pathname)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'relative flex flex-col items-center gap-1 px-1 py-2 text-[11px]',
                  active ? 'font-medium text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.short ?? item.label}
                <CountBadge n={countFor(item)} className="absolute top-1 left-1/2 ml-2" />
              </NavLink>
            )
          })}
          <NavLink
            to="/more"
            className={cn(
              'flex flex-col items-center gap-1 px-1 py-2 text-[11px]',
              moreActive ? 'font-medium text-primary' : 'text-muted-foreground',
            )}
          >
            <Menu className="size-5" aria-hidden />
            More
          </NavLink>
        </nav>
      </div>
    </div>
  )
}
