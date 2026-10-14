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
    // Both reads must succeed, or this would compare undefined with undefined and pass.
    const before = await s.c.from('profiles').select('id')
    expect(before.error).toBeNull()
    expect(before.data?.length).toBeGreaterThan(0)
    await s.c.from('profiles').delete().eq('id', s.id)
    const after = await s.c.from('profiles').select('id')
    expect(after.error).toBeNull()
    expect(after.data).toHaveLength(before.data!.length)
  })
})

// ---------------------------------------------------------------------------
// Phase 1 tables, views and actions.
// ---------------------------------------------------------------------------
const PHASE1_READABLE = [
  'departments',
  'locations',
  'categories',
  'vendors',
  'stock_items',
  'accessory_types',
  'settings',
  'employees',
  'assets',
  'asset_accessories',
  'handover_forms',
  'change_log',
  'audit_log',
  'v_category_summary',
  'v_department_summary',
  'v_employee_holdings',
  'v_dashboard',
] as const

/**
 * Every write action, with arguments that name real parameters (so PostgREST finds the
 * function) but point at nothing. A caller who is not admin must be refused before any of it
 * is looked at.
 */
const NOWHERE = '00000000-0000-0000-0000-000000000000'
const WRITE_ACTIONS: [string, Record<string, unknown>][] = [
  ['next_asset_tag', { p_category_id: 1 }],
  ['add_assets', { p_category_id: 1, p_qty: 1 }],
  ['issue_assets', { p_employee_id: NOWHERE, p_items: [] }],
  ['return_assets', { p_items: [] }],
  ['transfer_assets', { p_from_employee_id: NOWHERE, p_to_employee_id: NOWHERE, p_asset_ids: [] }],
  ['move_asset', { p_asset_id: NOWHERE, p_location_id: null, p_department_id: null }],
  ['retire_asset', { p_asset_id: NOWHERE, p_reason: 'rls test' }],
  ['dispose_asset', { p_asset_id: NOWHERE, p_reason: 'rls test' }],
]

describe('1. logged out: Phase 1', () => {
  const anon = client()

  it.each(PHASE1_READABLE)('reads nothing from %s', async (name) => {
    const { data, error } = await anon.from(name).select('*').limit(1)
    if (error) expect(error.code, error.message).toBe(PERMISSION_DENIED)
    else expect(data).toHaveLength(0)
  })

  it.each(WRITE_ACTIONS)('cannot call %s', async (fn, args) => {
    const { error } = await anon.rpc(fn, args)
    expect(error?.code, error?.message).toBe(PERMISSION_DENIED)
  })
})

describe('4. no profile row: Phase 1', () => {
  let s: Awaited<ReturnType<typeof signedIn>>
  beforeAll(async () => (s = await signedIn('NOPROFILE')))
  afterAll(async () => void (await s?.c.auth.signOut()))

  it.each(PHASE1_READABLE)('reads nothing from %s', async (name) => {
    const { data, error } = await s.c.from(name).select('*').limit(1)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})

describe('2. viewer: Phase 1', () => {
  let s: Awaited<ReturnType<typeof signedIn>>
  beforeAll(async () => (s = await signedIn('VIEWER')))
  afterAll(async () => void (await s?.c.auth.signOut()))

  it('reads the seeded lists', async () => {
    const deps = await s.c.from('departments').select('name')
    expect(deps.error).toBeNull()
    expect(deps.data?.map((d) => d.name)).toEqual(
      expect.arrayContaining(['HR', 'Sales', 'Retention', 'Travel', 'IT']),
    )
    const cats = await s.c.from('categories').select('tag_prefix')
    expect(cats.data?.length).toBeGreaterThanOrEqual(21)
  })

  it('reads the dashboard', async () => {
    const { data, error } = await s.c.from('v_dashboard').select('*')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it.each(WRITE_ACTIONS)('is told "not allowed" by %s', async (fn, args) => {
    const { error } = await s.c.rpc(fn, args)
    expect(error?.message).toBe('not allowed')
  })

  it('cannot add to a list', async () => {
    const { error } = await s.c.from('departments').insert({ name: 'RLS test dept' })
    // RLS refuses the row (42501), so nothing is written.
    expect(error?.code, error?.message).toBe(PERMISSION_DENIED)
  })

  it('cannot add a person', async () => {
    const { error } = await s.c
      .from('employees')
      .insert({ full_name: 'RLS Test', nid: '200099999999' })
    expect(error?.code, error?.message).toBe(PERMISSION_DENIED)
  })
})

describe('3. admin: the asset guard', () => {
  let s: Awaited<ReturnType<typeof signedIn>>
  beforeAll(async () => (s = await signedIn('ADMIN')))
  afterAll(async () => void (await s?.c.auth.signOut()))

  it('cannot add an asset directly (only add_assets can)', async () => {
    const { error } = await s.c.from('assets').insert({ asset_tag: 'PBS-OTH-999', category_id: 1 })
    expect(error?.code, error?.message).toBe(PERMISSION_DENIED)
  })

  it('cannot change status directly', async (ctx) => {
    // Needs an asset someone holds. Spare + a holder also breaks a check constraint, so even
    // if the guard were missing this attempt could not write anything to DEV.
    const { data } = await s.c
      .from('assets')
      .select('id')
      .not('assigned_employee_id', 'is', null)
      .limit(1)
    if (!data?.length) ctx.skip() // DEV has no issued assets yet (before the import)
    const { error } = await s.c.from('assets').update({ status: 'spare' }).eq('id', data![0].id)
    expect(error?.message).toMatch(/only through the Issue/)
  })

  // The other half of item 3 (the same change through the RPC works and writes a Change Log
  // row) would write to DEV, so it lives in supabase/tests/actions.sql, which rolls back.
})

// ---------------------------------------------------------------------------
// Phase 2: faults, service jobs, stock movements, photos.
// ---------------------------------------------------------------------------
const PHASE2_READABLE = [
  'fault_log',
  'service_jobs',
  'service_lines',
  'stock_movements',
  'photos',
] as const

const PHASE2_WRITE_ACTIONS: [string, Record<string, unknown>][] = [
  ['record_service_job', { p_header: {}, p_lines: [] }],
  ['send_for_repair', { p_asset_id: NOWHERE }],
  ['back_from_repair', { p_asset_id: NOWHERE, p_condition: 'good' }],
]

/**
 * A 1x1 PNG: the smallest file an upload attempt can carry. Uploads are judged by Storage's
 * RLS message, so a request that never reached the bucket (404, network) does not pass.
 */
const TINY_PNG = new Blob(
  [
    Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      ),
      (ch) => ch.charCodeAt(0),
    ),
  ],
  { type: 'image/png' },
)

describe('1. logged out: Phase 2', () => {
  const anon = client()

  it.each(PHASE2_READABLE)('reads nothing from %s', async (name) => {
    const { data, error } = await anon.from(name).select('*').limit(1)
    if (error) expect(error.code, error.message).toBe(PERMISSION_DENIED)
    else expect(data).toHaveLength(0)
  })

  it.each(PHASE2_WRITE_ACTIONS)('cannot call %s', async (fn, args) => {
    const { error } = await anon.rpc(fn, args)
    expect(error?.code, error?.message).toBe(PERMISSION_DENIED)
  })

  it('cannot upload a photo', async () => {
    const { error } = await anon.storage.from('photos').upload('assets/rls-test/anon.png', TINY_PNG)
    expect(error?.message).toMatch(/row-level security/)
  })
})

describe('4. no profile row: Phase 2', () => {
  let s: Awaited<ReturnType<typeof signedIn>>
  beforeAll(async () => (s = await signedIn('NOPROFILE')))
  afterAll(async () => void (await s?.c.auth.signOut()))

  it.each(PHASE2_READABLE)('reads nothing from %s', async (name) => {
    const { data, error } = await s.c.from(name).select('*').limit(1)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('cannot upload a photo', async () => {
    const { error } = await s.c.storage
      .from('photos')
      .upload('assets/rls-test/noprofile.png', TINY_PNG)
    expect(error?.message).toMatch(/row-level security/)
  })
})

describe('2. viewer: Phase 2', () => {
  let s: Awaited<ReturnType<typeof signedIn>>
  beforeAll(async () => (s = await signedIn('VIEWER')))
  afterAll(async () => void (await s?.c.auth.signOut()))

  it.each(PHASE2_READABLE)('reads %s', async (name) => {
    const { error } = await s.c.from(name).select('*').limit(1)
    expect(error).toBeNull()
  })

  it.each(PHASE2_WRITE_ACTIONS)('is told "not allowed" by %s', async (fn, args) => {
    const { error } = await s.c.rpc(fn, args)
    expect(error?.message).toBe('not allowed')
  })

  it('cannot open a fault', async () => {
    const { error } = await s.c.from('fault_log').insert({ asset_id: NOWHERE, description: 'x' })
    expect(error?.code, error?.message).toBe(PERMISSION_DENIED)
  })

  it('cannot move stock', async () => {
    const { error } = await s.c
      .from('stock_movements')
      .insert({ stock_item_id: 1, movement_type: 'received', qty_change: 1 })
    expect(error?.message).toBe('not allowed')
  })

  it('cannot upload a photo', async () => {
    const { error } = await s.c.storage
      .from('photos')
      .upload('assets/rls-test/viewer.png', TINY_PNG)
    expect(error?.message).toMatch(/row-level security/)
  })
})

describe('3. admin: stock', () => {
  let s: Awaited<ReturnType<typeof signedIn>>
  beforeAll(async () => (s = await signedIn('ADMIN')))
  afterAll(async () => void (await s?.c.auth.signOut()))

  it('cannot set a stock quantity directly', async () => {
    const { data } = await s.c.from('stock_items').select('id, qty_on_hand').limit(1)
    expect(data?.length, 'needs at least one stock item').toBeGreaterThan(0)
    const { error } = await s.c
      .from('stock_items')
      .update({ qty_on_hand: data![0].qty_on_hand + 100 })
      .eq('id', data![0].id)
    expect(error?.message).toMatch(/only through a movement/)
  })
})
