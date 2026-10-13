import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { useAuth } from './useAuth'

/** Shown to a logged-in user who has no `profiles` row. They can see nothing else. */
export function NoAccessPage() {
  const { email, signOut } = useAuth()

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Ask IT for access</CardTitle>
          <CardDescription>
            You are signed in{email ? ` as ${email}` : ''}, but this account has not been given
            access to Phoenix Inventory yet. Please ask Sahan in IT to set it up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" onClick={() => void signOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
