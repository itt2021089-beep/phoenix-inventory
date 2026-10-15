import { ChevronRight, LogOut } from 'lucide-react'
import { Link } from 'react-router'

import { useAuth } from '@/features/auth/useAuth'
import { useNavCounts } from '@/features/dashboard/useDashboard'
import { USER_ROLE_LABELS } from '@/lib/constants'

import { navFor } from './nav'
import { PageHeader } from './PageHeader'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

/** The phone's "More": the whole menu in its groups, and who is signed in. */
export function MorePage() {
  const { profile, signOut } = useAuth()
  const counts = useNavCounts()

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Menu" />
      {navFor(profile?.role).map((g) => (
        <section key={g.title ?? 'top'} className="mb-4">
          {g.title && (
            <h2 className="mb-1 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {g.title}
            </h2>
          )}
          <div className="divide-y rounded-lg border bg-card">
            {g.items.map((item) => {
              const Icon = item.icon
              const n = item.badge === 'openFaults' ? counts.data?.openFaults : 0
              return (
                <Link key={item.to} to={item.to} className="flex items-center gap-3 px-4 py-3">
                  <Icon className="size-5 text-muted-foreground" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {!!n && (
                    <span className="rounded-full bg-destructive px-2 text-xs leading-5 text-destructive-foreground">
                      {n}
                    </span>
                  )}
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              )
            })}
          </div>
        </section>
      ))}

      {profile && (
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{profile.full_name}</p>
            <Badge variant="secondary">{USER_ROLE_LABELS[profile.role]}</Badge>
          </div>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Button>
        </div>
      )}
    </div>
  )
}
