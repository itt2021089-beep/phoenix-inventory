import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { tagFromPath } from '@/features/public-report/reportForm'
import { supabase } from '@/lib/supabase'

import './index.css'

/**
 * Two apps share this address. A logged-out phone scanning a QR label (/a/<tag>) gets only the
 * small report page; everyone else gets the full app. The full app is loaded only when needed,
 * so a staff member on a cheap phone and mobile data never downloads the admin screens.
 */
async function start() {
  // React logs a crashed screen's full error text by default. That text can carry a name or an
  // NID (CLAUDE.md: never in console logs), so only the kind of error is logged, by the
  // ErrorBoundary and here for anything uncaught.
  const root = createRoot(document.getElementById('root')!, {
    onCaughtError: () => {},
    onUncaughtError: (error) =>
      console.error(`The page crashed (${(error as Error)?.name ?? 'Error'}).`),
    onRecoverableError: () => {},
  })
  const tag = tagFromPath(window.location.pathname)
  // getSession reads local storage and refreshes an old token; it needs no network when signed out.
  const signedIn = tag ? !!(await supabase.auth.getSession()).data.session : false

  if (tag && !signedIn) {
    const { PublicEntry } = await import('@/features/public-report/PublicEntry')
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <PublicEntry tag={tag} />
        </ErrorBoundary>
      </StrictMode>,
    )
    return
  }
  const { default: App } = await import('./App.tsx')
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}

void start()
