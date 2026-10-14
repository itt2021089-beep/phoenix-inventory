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

// ---------------------------------------------------------------------------
// Phase 3: what a logged-out phone may do after scanning a QR label. Every report attempted
// here is one that must be refused, so DEV gains no faults and no files.
// ---------------------------------------------------------------------------
describe('1. logged out: the QR report functions', () => {
  const anon = client()

  it('ping answers', async () => {
    const { data, error } = await anon.rpc('ping')
    expect(error).toBeNull()
    expect(data).toBe(1)
  })

  it('get_public_asset gives tag, category, make and model only, or nothing', async () => {
    const unknown = await anon.rpc('get_public_asset', { p_tag: 'PBS-NOPE-999' })
    expect(unknown.error).toBeNull()
    expect(unknown.data).toEqual([])

    // Any real tag will do; read it as the viewer would, without printing it.
    const { data: rows, error } = await anon.rpc('get_public_asset', { p_tag: 'PBS-LAP-001' })
    expect(error).toBeNull()
    for (const row of (rows ?? []) as Record<string, unknown>[]) {
      expect(Object.keys(row).sort()).toEqual(['asset_tag', 'category', 'make', 'model'])
    }
  })

  it('submit_fault_report refuses an unknown tag', async () => {
    const { error } = await anon.rpc('submit_fault_report', {
      p_tag: 'PBS-NOPE-999',
      p_reporter_name: 'RLS test',
      p_description: 'RLS test, must be refused',
    })
    expect(error?.message).toMatch(/not recognised/)
  })

  it('submit_fault_report refuses a missing name before anything is saved', async () => {
    const { error } = await anon.rpc('submit_fault_report', {
      p_tag: 'PBS-LAP-001',
      p_reporter_name: '   ',
      p_description: 'RLS test, must be refused',
    })
    expect(error?.message).toMatch(/Please enter your name/)
  })

  it('submit_fault_report refuses a photo path that was never uploaded', async () => {
    const { error } = await anon.rpc('submit_fault_report', {
      p_tag: 'PBS-LAP-001',
      p_reporter_name: 'RLS test',
      p_description: 'RLS test, must be refused',
      p_photo_path: 'reports/00000000-0000-0000-0000-000000000000.jpg',
    })
    expect(error?.message).toMatch(/photo did not upload/)
  })

  it('cannot upload outside reports/ or under a name that is not random', async () => {
    for (const path of ['assets/rls-test/anon.png', 'reports/rls-test.jpg']) {
      const { error } = await anon.storage.from('photos').upload(path, TINY_PNG)
      expect(error?.message, path).toMatch(/row-level security/)
    }
  })

  it('cannot list or read the reports folder', async () => {
    const { data, error } = await anon.storage.from('photos').list('reports')
    if (!error) expect(data ?? []).toHaveLength(0)
  })
})

describe('2. viewer: the QR report is for logged-out phones only', () => {
  let s: Awaited<ReturnType<typeof signedIn>>
  beforeAll(async () => (s = await signedIn('VIEWER')))
  afterAll(async () => void (await s?.c.auth.signOut()))

  it('cannot file a report (viewers write nothing)', async () => {
    const { error } = await s.c.rpc('submit_fault_report', {
      p_tag: 'PBS-LAP-001',
      p_reporter_name: 'RLS test',
      p_description: 'RLS test, must be refused',
    })
    expect(error?.code, error?.message).toBe(PERMISSION_DENIED)
  })

  it('can still look up a tag', async () => {
    const { error } = await s.c.rpc('get_public_asset', { p_tag: 'PBS-LAP-001' })
    expect(error).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Phase 4: reminder and repair-vs-replace views, spend report, swap and thresholds.
// ---------------------------------------------------------------------------
const PHASE4_VIEWS = [
  'v_asset_costs',
  'v_due_soon',
  'v_stock_levels',
  'v_open_faults',
  'v_spend_monthly',
] as const

const SWAP_ARGS = {
  p_faulty_asset_id: NOWHERE,
  p_spare_asset_id: NOWHERE,
  p_fault_description: 'rls test',
}

describe('1. logged out: Phase 4', () => {
  const anon = client()

  it.each(PHASE4_VIEWS)('reads nothing from %s', async (name) => {
    const { data, error } = await anon.from(name).select('*').limit(1)
    if (error) expect(error.code, error.message).toBe(PERMISSION_DENIED)
    else expect(data).toHaveLength(0)
  })

  it('cannot swap an asset', async () => {
    const { error } = await anon.rpc('swap_asset', SWAP_ARGS)
    expect(error?.code, error?.message).toBe(PERMISSION_DENIED)
  })

  it('cannot read or change the thresholds', async () => {
    const read = await anon.from('settings').select('key').limit(1)
    if (read.error) expect(read.error.code).toBe(PERMISSION_DENIED)
    else expect(read.data).toHaveLength(0)
    const write = await anon.from('settings').update({ value: 1 }).eq('key', 'repair_replace_pct')
    expect(write.error?.code, write.error?.message).toBe(PERMISSION_DENIED)
  })
})

describe('4. no profile row: Phase 4', () => {
  let s: Awaited<ReturnType<typeof signedIn>>
  beforeAll(async () => (s = await signedIn('NOPROFILE')))
  afterAll(async () => void (await s?.c.auth.signOut()))

  it.each(PHASE4_VIEWS)('reads nothing from %s', async (name) => {
    const { data, error } = await s.c.from(name).select('*').limit(1)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('sees no dashboard row', async () => {
    const { data, error } = await s.c.from('v_dashboard').select('*')
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})

describe('2. viewer: Phase 4', () => {
  let s: Awaited<ReturnType<typeof signedIn>>
  beforeAll(async () => (s = await signedIn('VIEWER')))
  afterAll(async () => void (await s?.c.auth.signOut()))

  it.each(PHASE4_VIEWS)('reads %s', async (name) => {
    const { error } = await s.c.from(name).select('*').limit(1)
    expect(error).toBeNull()
  })

  it('reads the dashboard counts, including the Phase 4 ones', async () => {
    const { data, error } = await s.c.from('v_dashboard').select('*')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(Object.keys(data![0])).toEqual(
      expect.arrayContaining([
        'open_faults',
        'stock_to_reorder',
        'due_soon',
        'overdue',
        'flagged_assets',
      ]),
    )
  })

  it('is told "not allowed" by swap_asset', async () => {
    const { error } = await s.c.rpc('swap_asset', SWAP_ARGS)
    expect(error?.message).toBe('not allowed')
  })

  it('cannot change a threshold', async () => {
    // Under RLS the update matches no rows: no error, and the value must be unchanged.
    const before = await s.c
      .from('settings')
      .select('value')
      .eq('key', 'repair_replace_pct')
      .single()
    await s.c.from('settings').update({ value: 999 }).eq('key', 'repair_replace_pct')
    const after = await s.c
      .from('settings')
      .select('value')
      .eq('key', 'repair_replace_pct')
      .single()
    expect(after.data?.value).toEqual(before.data?.value)
  })
})

describe('2. viewer: the audit log is IT only', () => {
  let s: Awaited<ReturnType<typeof signedIn>>
  beforeAll(async () => (s = await signedIn('VIEWER')))
  afterAll(async () => void (await s?.c.auth.signOut()))

  it('reads no audit rows', async () => {
    const { data, error } = await s.c.from('audit_log').select('id').limit(1)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})

describe('3. admin: the audit log', () => {
  let s: Awaited<ReturnType<typeof signedIn>>
  beforeAll(async () => (s = await signedIn('ADMIN')))
  afterAll(async () => void (await s?.c.auth.signOut()))

  it('reads it, but cannot add to it, change it or delete from it', async () => {
    const read = await s.c.from('audit_log').select('id').limit(1)
    expect(read.error).toBeNull()
    expect(read.data?.length, 'DEV has audit rows after the import').toBeGreaterThan(0)
    const write = await s.c
      .from('audit_log')
      .insert({ table_name: 'rls-test', record_id: 'x', action: 'insert' })
    expect(write.error?.code, write.error?.message).toBe(PERMISSION_DENIED)
    const change = await s.c.from('audit_log').update({ record_id: 'x' }).eq('id', read.data![0].id)
    expect(change.error?.code, change.error?.message).toBe(PERMISSION_DENIED)
    const del = await s.c.from('audit_log').delete().eq('id', read.data![0].id)
    expect(del.error?.code, del.error?.message).toBe(PERMISSION_DENIED)
  })
})
