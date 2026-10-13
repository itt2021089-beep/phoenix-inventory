/**
 * RLS checklist against the DEV project, through the real API (docs/BUILD_PLAN.md).
 *
 *   npm run test:rls
 *
 * Needs, in gitignored env files:
 *   .env.local       VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY   (DEV only)
 *   .env.test.local  TEST_{ADMIN,VIEWER,NOPROFILE}_{EMAIL,PASSWORD}
 *
 * The three accounts are made by hand in the DEV dashboard: admin and viewer each with a
 * profiles row of that role, and noprofile with none. Uses only the publishable key, exactly
 * like the app. Nothing here may ever use the secret key: that key bypasses RLS, so a test run
 * with it would prove nothing.
 *
 * Every write it attempts is one that must be refused, so a passing run leaves DEV unchanged.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

function need(name: string): string {
  const value = process.env[name]
  if (!value)
    throw new Error(`${name} is not set. See the header of supabase/tests/rls.api.test.ts.`)
  return value
}

function client(): SupabaseClient {
  const url = need('VITE_SUPABASE_URL')
  const key = need('VITE_SUPABASE_PUBLISHABLE_KEY')
  if (key.startsWith('sb_secret_')) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY holds a SECRET key. Use the publishable key.')
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function signedIn(who: 'ADMIN' | 'VIEWER' | 'NOPROFILE') {
  const c = client()
  const { data, error } = await c.auth.signInWithPassword({
    email: need(`TEST_${who}_EMAIL`),
    password: need(`TEST_${who}_PASSWORD`),
  })
  if (error) throw new Error(`Could not sign in the ${who} test account: ${error.message}`)
  return { c, id: data.user.id }
}

/** Calls an RPC and returns its boolean result, failing loudly on any error. */
async function bool(c: SupabaseClient, fn: 'is_admin' | 'is_viewer_or_admin') {
  const { data, error } = await c.rpc(fn)
  if (error) throw new Error(`${fn}() failed: ${error.message}`)
  return data as boolean
}

/**
 * A refusal must come from the database (Postgres 42501, permission denied), never from a
 * network failure: a request that never arrived also "returns no rows" and would pass falsely.
 */
const PERMISSION_DENIED = '42501'

describe('1. logged out (publishable key only)', () => {
  const anon = client()

  it('reads no profiles', async () => {
    const { data, error } = await anon.from('profiles').select('id')
    if (error) expect(error.code, error.message).toBe(PERMISSION_DENIED)
    else expect(data).toHaveLength(0)
  })

  it('cannot call the role helpers', async () => {
    const { error } = await anon.rpc('is_admin')
    expect(error?.code, error?.message).toBe(PERMISSION_DENIED)
  })
})

describe('4. logged in with no profile row', () => {
  let s: Awaited<ReturnType<typeof signedIn>>
  beforeAll(async () => (s = await signedIn('NOPROFILE')))
  afterAll(async () => void (await s?.c.auth.signOut()))

  it('reads no profiles', async () => {
    const { data, error } = await s.c.from('profiles').select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('is neither admin nor viewer', async () => {
    expect(await bool(s.c, 'is_admin')).toBe(false)
    expect(await bool(s.c, 'is_viewer_or_admin')).toBe(false)
  })
})

describe('2. viewer', () => {
  let s: Awaited<ReturnType<typeof signedIn>>
  beforeAll(async () => (s = await signedIn('VIEWER')))
  afterAll(async () => void (await s?.c.auth.signOut()))

  it('has a viewer profile row (test setup check)', async () => {
    const { data, error } = await s.c.from('profiles').select('role').eq('id', s.id).maybeSingle()
    expect(error).toBeNull()
    expect(data?.role, 'give the viewer test account a profiles row with role viewer').toBe(
      'viewer',
    )
  })

  it('reads every profile, not just their own', async () => {
    const { data } = await s.c.from('profiles').select('id')
    expect((data ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('is a viewer and not an admin', async () => {
    expect(await bool(s.c, 'is_admin')).toBe(false)
    expect(await bool(s.c, 'is_viewer_or_admin')).toBe(true)
  })

  it('cannot promote themselves to admin', async () => {
    await s.c.from('profiles').update({ role: 'admin' }).eq('id', s.id)
    // Judge by the outcome, not the error shape: the role must still be viewer.
    expect(await bool(s.c, 'is_admin')).toBe(false)
  })
})

describe('admin', () => {
  let s: Awaited<ReturnType<typeof signedIn>>
  beforeAll(async () => (s = await signedIn('ADMIN')))
  afterAll(async () => void (await s?.c.auth.signOut()))

  it('is recognised as admin (fails if profiles is FORCE row level security)', async () => {
    expect(await bool(s.c, 'is_admin')).toBe(true)
    expect(await bool(s.c, 'is_viewer_or_admin')).toBe(true)
  })

  it('cannot insert a profile through the API', async () => {
    const { error } = await s.c
      .from('profiles')
      .insert({ id: '00000000-0000-0000-0000-000000000001', full_name: 'Sneaky', role: 'admin' })
    expect(error?.code, error?.message).toBe(PERMISSION_DENIED)
  })

  it('cannot delete a profile through the API', async () => {
    const before = await s.c.from('profiles').select('id')
    await s.c.from('profiles').delete().eq('id', s.id)
    const after = await s.c.from('profiles').select('id')
    expect(after.data?.length).toBe(before.data?.length)
  })
})
