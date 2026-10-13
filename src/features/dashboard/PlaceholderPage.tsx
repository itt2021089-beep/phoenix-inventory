import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/** A named section that a later phase fills in, so the nav is never a dead link. */
export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Coming in {phase}</CardTitle>
          <CardDescription>This screen has not been built yet.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
