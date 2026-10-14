import { Navigate, Outlet, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { useAuth } from './useAuth'

/**
 * The gate every signed-in screen sits behind. Four outcomes:
 *   - still loading  -> a quiet placeholder, so nothing flashes
 *   - no session     -> the login page, remembering where they were heading
 *   - profile unreadable (offline) -> "could not reach the server" with a retry
 *   - no profile row -> the "ask IT for access" screen and nothing else
 */
export function RequireAuth() {
  const { loading, userId, profile, profileError, retryProfile, signOut } = useAuth()
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
  if (profileError) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Could not reach the server</CardTitle>
            <CardDescription>
              Check the internet connection and try again. Nothing is wrong with your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button onClick={retryProfile}>Try again</Button>
            <Button variant="outline" onClick={() => void signOut()}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  if (!profile) return <Navigate to="/no-access" replace />

  return <Outlet />
}
