import { NavLink, useSearchParams } from 'react-router'

import { cn } from '@/lib/utils'

/** Issue | Return | Transfer, keeping the chosen person when switching. */
export function HandoverTabs() {
  const [params] = useSearchParams()
  const employee = params.get('employee')
  const suffix = employee ? `?employee=${employee}` : ''
  return (
    <nav aria-label="Hand over" className="mb-4 flex gap-1 border-b">
      {[
        ['/issue', 'Issue'],
        ['/return', 'Return'],
        ['/transfer', 'Transfer'],
      ].map(([to, label]) => (
        <NavLink
          key={to}
          to={`${to}${suffix}`}
          className={({ isActive }) =>
            cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              isActive
                ? 'border-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
