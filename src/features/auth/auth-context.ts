import { createContext } from 'react'

import type { Profile } from '@/lib/db'

export type AuthState = {
  /** Still working out who the user is. Nothing should be decided while this is true. */
  loading: boolean
  /** Null when nobody is logged in. */
  userId: string | null
  email: string | null
  /**
   * Null when the logged-in user has no `profiles` row. That is not an error: it means
   * "no profile, no access" (CLAUDE.md), and the app shows the ask-IT screen.
   */
  profile: Profile | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
