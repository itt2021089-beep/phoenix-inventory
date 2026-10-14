import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { tagFromPath } from '@/features/public-report/reportForm'
import { supabase } from '@/lib/supabase'

import './index.css'

/**
 * Two apps share this address. A logged-out phone scanning a QR label (/a/<tag>) gets only the
 * small report page; everyone else gets the full app. The full app is loaded only when needed,
 * so a staff member on a cheap phone and mobile data never downloads the admin screens.
 */
async function start() {
  const root = createRoot(document.getElementById('root')!)
  const tag = tagFromPath(window.location.pathname)
  // getSession reads local storage and refreshes an old token; it needs no network when signed out.
  const signedIn = tag ? !!(await supabase.auth.getSession()).data.session : false

  if (tag && !signedIn) {
    const { PublicEntry } = await import('@/features/public-report/PublicEntry')
    root.render(
      <StrictMode>
        <PublicEntry tag={tag} />
      </StrictMode>,
    )
    return
  }
  const { default: App } = await import('./App.tsx')
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
