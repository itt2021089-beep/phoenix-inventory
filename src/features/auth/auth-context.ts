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
  /**
   * True when the profile could not be read at all (no network, server down). That is not
   * the same as having no profile, so the app says "could not reach the server" and offers a
   * retry instead of telling a real admin to ask IT for access.
   */
  profileError: boolean
  /** Try reading the profile again after a failure. */
  retryProfile: () => void
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
