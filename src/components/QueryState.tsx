import { Alert, AlertDescription } from '@/components/ui/alert'
import { errorMessage } from '@/lib/errors'

/** Loading and error states, shown the same way on every page. */
export function QueryState({ isLoading, error }: { isLoading: boolean; error: unknown }) {
  if (isLoading) {
    return (
      <p role="status" className="py-8 text-center text-sm text-muted-foreground">
        Loading...
      </p>
    )
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(error)}</AlertDescription>
      </Alert>
    )
  }
  return null
}
