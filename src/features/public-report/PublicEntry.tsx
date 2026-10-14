import { PublicReportPage } from './PublicReportPage'

/** The whole public side of the app: no router, no admin screens, no query cache. */
export function PublicEntry({ tag }: { tag: string }) {
  return <PublicReportPage tag={tag} />
}
