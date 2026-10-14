import { Outlet } from 'react-router'

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { useAuth } from './useAuth'

/**
 * Screens that change data. Viewers never see the buttons that lead here; this catches a
 * typed or bookmarked URL. The database refuses their writes regardless (RLS, is_admin()).
 */
export function RequireAdmin() {
  const { profile } = useAuth()
  if (profile?.role !== 'admin') {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Only IT can do this</CardTitle>
          <CardDescription>Your account can view everything but not change it.</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return <Outlet />
}
