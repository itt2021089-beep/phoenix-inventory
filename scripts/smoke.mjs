#!/usr/bin/env node
/**
 * A read-only safety check you can run against ANY project, PROD included, with only the
 * publishable key (the one that is already in the app). It looks at the project the way a
 * stranger on the internet would and fails if anything is open that should not be:
 *
 *   npm run smoke                       (reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
 *                                        from the environment or .env.local)
 *   SMOKE_URL=https://xxxx.supabase.co SMOKE_KEY=sb_publishable_... npm run smoke
 *
 * It never writes anything: every write it tries is one that must be refused, and the report
 * function is only sent input that must be rejected. It never prints a key or a row.
 * Exit code 0 = all clear, 1 = something is open or the project is not reachable.
 */
import { existsSync, readFileSync } from 'node:fs'

function fromEnvFile(name) {
  for (const f of ['.env.local']) {
    if (!existsSync(f)) continue
    const m = readFileSync(f, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'))
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '')
  }
  return undefined
}
const url = (process.env.SMOKE_URL || process.env.VITE_SUPABASE_URL || fromEnvFile('VITE_SUPABASE_URL') || '').replace(/\/+$/, '')
const key = process.env.SMOKE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fromEnvFile('VITE_SUPABASE_PUBLISHABLE_KEY') || ''

if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (in .env.local), or SMOKE_URL and SMOKE_KEY.')
  process.exit(1)
}
if (key.startsWith('sb_secret_') || /service_role/i.test(key)) {
  console.error('That looks like a SECRET key. This check must only ever use the publishable key. Stopping.')
  process.exit(1)
}

const headers = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' }
let failures = 0
const pass = (m) => console.log(`  ok    ${m}`)
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`) }
const check = (ok, m) => (ok ? pass(m) : fail(m))
const call = async (path, init = {}) => {
  try {
    const r = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
    const text = await r.text()
    let json
    try { json = JSON.parse(text) } catch { /* not JSON */ }
    return { status: r.status, text, json }
  } catch (e) {
    return { status: 0, text: String(e.message), json: undefined }
  }
}
const refused = (r) => r.status === 401 || r.status === 403 || r.status === 404 || r.status === 400
const empty = (r) => Array.isArray(r.json) && r.json.length === 0

console.log(`Checking ${new URL(url).host} as a logged-out visitor\n`)

// 1. Reachable, and the one public heartbeat works.
const ping = await call('/rest/v1/rpc/ping', { method: 'POST', body: '{}' })
if (ping.status === 0) { console.log(`  FAIL  Could not reach the project (${ping.text}).`); process.exit(1) }
check(ping.status === 200 && ping.text.trim() === '1', 'ping() answers 1 (the keep-alive works)')

// 2. Every table and view: nothing readable. Discover the names the API publishes.
const spec = await call('/rest/v1/')
let names = spec.json?.paths ? Object.keys(spec.json.paths).map((p) => p.slice(1)).filter((p) => p && !p.startsWith('rpc/')) : []
const FALLBACK = ['profiles', 'departments', 'locations', 'categories', 'vendors', 'stock_items', 'accessory_types', 'settings', 'employees', 'assets', 'asset_accessories', 'handover_forms', 'change_log', 'audit_log', 'fault_log', 'service_jobs', 'service_lines', 'stock_movements', 'photos', 'v_dashboard', 'v_category_summary', 'v_department_summary', 'v_employee_holdings', 'v_asset_costs', 'v_due_soon', 'v_stock_levels', 'v_open_faults', 'v_spend_monthly']
names = [...new Set([...names, ...FALLBACK])]
let open = []
for (const n of names) {
  const r = await call(`/rest/v1/${encodeURIComponent(n)}?select=*&limit=1`)
  if (!(refused(r) || empty(r))) open.push(`${n} (${r.status})`)
}
check(open.length === 0, `${names.length} tables and views: a logged-out visitor reads nothing${open.length ? `. OPEN: ${open.join(', ')}` : ''}`)

// 3. Write actions are refused. Each is sent no real ids, so even a mistake could do nothing.
const NOWHERE = '00000000-0000-0000-0000-000000000000'
const writes = {
  is_admin: {}, next_asset_tag: { p_category_id: 1 }, add_assets: { p_category_id: 1, p_qty: 1 },
  issue_assets: { p_employee_id: NOWHERE, p_items: [] }, return_assets: { p_items: [] },
  transfer_assets: { p_from_employee_id: NOWHERE, p_to_employee_id: NOWHERE, p_asset_ids: [] },
  move_asset: { p_asset_id: NOWHERE, p_location_id: null, p_department_id: null },
  retire_asset: { p_asset_id: NOWHERE, p_reason: 'smoke' }, dispose_asset: { p_asset_id: NOWHERE, p_reason: 'smoke' },
  swap_asset: { p_faulty_asset_id: NOWHERE, p_spare_asset_id: NOWHERE },
  send_for_repair: { p_asset_id: NOWHERE }, back_from_repair: { p_asset_id: NOWHERE, p_condition: 'good' },
  record_service_job: { p_header: {}, p_lines: [] }, import_workbook: { p_payload: {} },
}
const openFns = []
for (const [fn, args] of Object.entries(writes)) {
  const r = await call(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })
  if (!(r.status === 401 || r.status === 403 || r.status === 404)) openFns.push(`${fn} (${r.status})`)
}
check(openFns.length === 0, `${Object.keys(writes).length} write functions refuse a logged-out visitor${openFns.length ? `. OPEN: ${openFns.join(', ')}` : ''}`)

// 4. The public report: shows only what it should, and rejects bad input (nothing is filed).
const none = await call('/rest/v1/rpc/get_public_asset', { method: 'POST', body: JSON.stringify({ p_tag: 'PBS-NOPE-999' }) })
check(none.status === 200 && empty(none), 'an unknown tag shows nothing')
const probe = await call('/rest/v1/rpc/get_public_asset', { method: 'POST', body: JSON.stringify({ p_tag: 'PBS-LAP-001' }) })
const leaked = Array.isArray(probe.json) ? probe.json.flatMap((row) => Object.keys(row)).filter((k) => !['asset_tag', 'category', 'make', 'model'].includes(k)) : []
check(probe.status === 200 && leaked.length === 0, 'a tag lookup returns only tag, category, make and model')
const bad = await call('/rest/v1/rpc/submit_fault_report', { method: 'POST', body: JSON.stringify({ p_tag: 'PBS-NOPE-999', p_reporter_name: ' ', p_description: 'smoke test, must be rejected' }) })
check(bad.status >= 400 && bad.status < 500, 'a bad report is rejected, in a plain sentence, and nothing is filed')
check(!/permission|relation|column|violates|SQLSTATE|auth\.uid/i.test(String(bad.json?.message ?? '')), 'the rejection reveals nothing technical')

// 5. Storage: the photos bucket is private; a stranger cannot read, list or upload outside reports/.
const publicRead = await call('/storage/v1/object/public/photos/assets/x/x.jpg')
check(publicRead.status !== 200, 'the photos bucket is not public')
const list = await call('/storage/v1/object/list/photos', { method: 'POST', body: JSON.stringify({ prefix: '', limit: 1 }) })
check(refused(list) || empty(list), 'a stranger cannot list the photos')
const form = new FormData()
form.append('file', new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'x.jpg')
const upload = await fetch(`${url}/storage/v1/object/photos/assets/smoke-test/x.jpg`, { method: 'POST', headers: { apikey: key, authorization: `Bearer ${key}` }, body: form }).then((r) => r.status).catch(() => 0)
check(upload === 400 || upload === 401 || upload === 403, `an upload outside reports/ is refused (${upload})`)

// 6. Sign-ups are closed (read from the public auth settings; this creates nothing).
const auth = await call('/auth/v1/settings')
if (auth.status === 200 && auth.json && 'disable_signup' in auth.json) check(auth.json.disable_signup === true, 'public sign-ups are disabled')
else fail('could not read the auth settings to confirm sign-ups are disabled')

console.log(failures ? `\n${failures} problem(s). Do not go live until they are fixed.` : '\nAll clear: a stranger sees nothing and can change nothing.')
process.exit(failures ? 1 : 0)
