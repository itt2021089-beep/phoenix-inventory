import { createClient } from '@supabase/supabase-js'

import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to ' +
      '.env.local and fill both in.',
  )
}

/**
 * The one Supabase client for the whole app.
 *
 * It only ever holds the PUBLISHABLE key (the "anon" key on older projects). Every rule that
 * matters is enforced in the database by RLS, so this key is safe in the browser. The secret
 * (service_role) key is never used anywhere in this app.
 */
export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // No magic links or email confirmations: Sahan creates accounts in the dashboard.
    detectSessionInUrl: false,
  },
})
