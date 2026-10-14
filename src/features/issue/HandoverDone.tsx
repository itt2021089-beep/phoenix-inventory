import { CheckCircle2, Printer } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** After Issue / Return / Transfer: what happened, and the handover form if one was made. */
export function HandoverDone({
  title,
  formNo,
  tags,
  personId,
  onAgain,
  againLabel,
}: {
  title: string
  formNo: string | null
  tags: string[]
  personId?: string
  onAgain: () => void
  againLabel: string
}) {
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-green-600" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="font-mono text-sm">{tags.join(', ')}</p>
        {formNo && (
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-sm">
              Handover form <span className="font-mono font-medium">{formNo}</span>. Its number is
              already on the Change Log rows.
            </p>
            <Button className="mt-2" asChild>
              <Link to={`/print/handover/${formNo}`} target="_blank" rel="noopener">
                <Printer /> Print handover form
              </Link>
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onAgain}>
            {againLabel}
          </Button>
          {personId && (
            <Button variant="outline" asChild>
              <Link to={`/people/${personId}`}>Go to person</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
