import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/useAuth'

/** Phase 0 placeholder. Phase 1 replaces this with the real counts. */
export function DashboardPage() {
  const { profile } = useAuth()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome{profile ? `, ${profile.full_name}` : ''}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nothing here yet</CardTitle>
          <CardDescription>
            Phase 0 set up the app, the login and the roles. The counts by status, category and
            department arrive with Phase 1.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  )
}
