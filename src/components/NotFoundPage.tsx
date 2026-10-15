import { Link } from 'react-router'

import { PageHeader } from './PageHeader'

/** Any address the app does not have, including pages that were removed (such as /audit). */
export function NotFoundPage() {
  return (
    <div>
      <PageHeader title="Page not found" description="There is no page at this address." />
      <Link to="/" className="text-sm text-primary hover:underline">
        Go to Home
      </Link>
    </div>
  )
}
