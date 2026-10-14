import { useCallback, useEffect, useMemo, useState } from 'react'

import { isUserRole, type Profile } from '@/lib/db'
import { supabase } from '@/lib/supabase'

import { AuthContext, type AuthState } from './auth-context'

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()

  // RLS returns no row rather than an error for a user without a profile, so a null `data`
  // with no error is the normal "no access" case.
  if (error) throw error
  if (!data) return null
  // The database only allows admin or viewer, but a role this app doesn't know means no
  // access, never a guess.
  return isUserRole(data.role) ? { ...data, role: data.role } : null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState(false)
  // Bumped by retryProfile() to run the effect's session read again.
  const [attempt, setAttempt] = useState(0)

  const retryProfile = useCallback(() => {
    setLoading(true)
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function applySession(id: string | null, mail: string | null) {
      if (cancelled) return
      setUserId(id)
      setEmail(mail)
      setProfileError(false)
      if (!id) {
        setProfile(null)
        setLoading(false)
        return
      }
      try {
        const row = await fetchProfile(id)
        if (!cancelled) setProfile(row)
      } catch {
        // An unreadable profile is not "no profile": a dropped connection must not tell a
        // real user to ask IT for access. Nobody gets in, and the screen offers a retry.
        if (!cancelled) {
          setProfile(null)
          setProfileError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      void applySession(data.session?.user.id ?? null, data.session?.user.email ?? null)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoading(true)
      void applySession(session?.user.id ?? null, session?.user.email ?? null)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [attempt])

  const signIn = useCallback(async (mail: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: mail, password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  const value = useMemo<AuthState>(
    () => ({ loading, userId, email, profile, profileError, retryProfile, signIn, signOut }),
    [loading, userId, email, profile, profileError, retryProfile, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
