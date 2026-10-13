import { Navigate, Outlet, useLocation } from 'react-router'

import { useAuth } from './useAuth'

/**
 * The gate every signed-in screen sits behind. Three outcomes:
 *   - still loading  -> a quiet placeholder, so nothing flashes
 *   - no session     -> the login page, remembering where they were heading
 *   - no profile row -> the "ask IT for access" screen and nothing else
 */
export function RequireAuth() {
  const { loading, userId, profile } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-dvh items-center justify-center text-muted-foreground"
      >
        Loading...
      </div>
    )
  }

  if (!userId) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (!profile) return <Navigate to="/no-access" replace />

  return <Outlet />
}
