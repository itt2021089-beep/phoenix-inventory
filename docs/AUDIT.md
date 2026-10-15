# Phoenix Inventory: full audit

**Date:** 15/10/2026 · **Version audited:** `main` at `ba04564` (PR #19 merged) · **Type:** read-only

This audit changed no code, migration, setting or data. This file is the only thing it created.

## How it was done

| Area | What was checked |
|---|---|
| Code | `npm run lint`, `tsc --noEmit`, `npm test`, `npm audit`, `npm outdated`; source read for dead code, risky patterns (`dangerouslySetInnerHTML`, console output, browser storage) and NID handling. |
| Database | The Postgres system catalog of a local copy that runs exactly the 18 migrations on `main`: RLS, policies, grants, `security definer` functions, views, constraints, triggers. Function bodies read for the business rules. |
| Security | The above, plus storage policies, error-message handling, URL parameters, the public report path, headers on the live site, and git history. |
| Business rules | Each rule in `CLAUDE.md` traced to the SQL or code that enforces it. |
| UX | The screens and flows, from code and from browser testing earlier on 15/10/2026 (local copy, fake and imported data). |
| Deployment | The live site's public files (which build is live, which Supabase project it uses, headers), the GitHub branches, the CI workflow, and `npm run smoke` against **DEV** (read-only). |
| Docs | `CLAUDE.md` and everything in `docs/`, compared with the code. |

**Not checked (needs Sahan or access this audit did not use):**
- PROD's database and API. By the project rules they're not touched without asking.
- The Supabase, Cloudflare and GitHub dashboards (settings, secrets, Actions runs).
- Real phones, real printers and a real QR scan.

Findings that depend on these are marked **Unverified**.

## Summary

The core of the app is solid:
- **Security:** RLS on every table, admin-only writes, a tight public surface and no NID leaks.
- **Data integrity:** a guard trigger, plus one SQL function per action, keeps the Change Log and the assets in step.
- **Tests:** 172 unit tests and 9 SQL suites pass.

The risks are mostly **outside the code**: leaked keys in git history, real staff data committed to the repo, and go-live steps that aren't confirmed. There's also **one real bug** from the last change (H2) and **one business-rule dead end** (M1).

| Severity | Count | Meaning |
|---|---|---|
| Critical | 1 | Fix before anyone else uses the app |
| High | 3 | Fix this week |
| Medium | 7 | Plan it |
| Low | 12 | Tidy up when convenient |

### Do these first
1. **C1:** replace the Supabase secret keys of DEV and PROD, which are in git history.
2. **H1:** confirm migration `20261020090000_department_follows_person` is on PROD. The live site already uses it.
3. **H2:** fix the "held item made Faulty, then back from repair as Spare" error.
4. **H3:** decide about the real workbook (with NIDs) that is committed to the repo.
5. **M3:** finish and tick the go-live checklist: viewer accounts, backups, keep-alive, smoke check.

### Status since the audit (15/10/2026)

Fixed on branch `claude/audit-fixes` (migration `20261021090000_audit_fixes`). It's on DEV, **not on PROD yet**.

| Finding | Status |
|---|---|
| H1 | **Resolved.** Sahan's `migration list` against PROD shows all 18 migrations applied. The CLI was left linked to PROD afterwards; it is linked back to DEV. |
| H2 | **Fixed.** Change status refuses Spare, Faulty and Under Repair while someone holds the item (Return does that); Send for repair refuses a held item; Back from repair as Spare clears any holder. Tested in `department.sql`. |
| M1 | **Fixed.** Marking an item Lost / Stolen clears its holder, and the Change Log keeps who had it. Items already Lost with a holder were cleared. A person whose item was lost can be marked Left (tested). |
| M2 | **Fixed.** Logged-out uploads to `reports/` are capped per hour at the QR report limit, through `private.report_upload_allowed()`, which the API doesn't publish. Tested in `public_report.sql`. |
| M4 | **Fixed (process).** `.github/pull_request_template.md`: push migrations to PROD before merging, then link back to DEV. |
| M6 | **Fixed.** CI gains a `database` job running the 9 SQL suites on a throwaway local Supabase. |
| M7 | **Improved.** Edit accessories links to Stock to adjust the count. |
| L1 | **Fixed.** Location fields, `useLocations`, `LOCATION_KIND_LABELS` and `pickSpellings` removed from the frontend; the DB objects stay. |
| L2 | **Fixed.** The import gives a held item its holder's department (unit test). |
| L3 | **Fixed.** Contact no. spans the row on the handover form and the leaver sheet. |
| L7 | **Fixed.** `README.md` added. |
| L9 | **Fixed.** The user guide says exported files contain NIDs. |
| C1, H3, M3, M5, L5, L6, L8 | **Open: need Sahan.** They need dashboard access, a decision, or deleting files (`data/` is never deleted by Claude). |
| L4, L10, L11, L12 | **Open: low.** No action now. |

---

## Findings

### Critical

**C1. Supabase secret keys are in git history. Rotation is unverified.**
- **Evidence:** commit `f9d89ca` (13/10/2026) added `.env.local` with `SUPABASE_SECRET_KEY` for **both DEV and PROD**, and `.env.test.local` with weak test-account passwords. The commit is reachable from `origin/main`. The DEV secret key was also pasted into `.env.example` (reverted, never committed) and appeared in a chat transcript.
- **Risk:** the secret key ignores every RLS rule. Anyone with repo access, now or later (a collaborator, a leaked clone, a mistakenly public repo), can read and change all PROD data, NIDs included.
- **Fix (Sahan):**
  - In both Supabase projects: Settings → API Keys, create a new secret key, then **delete** the old one. Nothing in the app uses it, so nothing breaks.
  - Change the passwords of the `rls-*` test accounts on DEV.
  - Rewriting history is optional once the keys are dead.

### High

**H1. The live site runs code that needs a migration PROD may not have. Unverified.**
- **Evidence:** the live bundle (served from `https://phoenix-inventory.pages.dev`, pointed at Supabase project `cgopxhyiwzbtbxjwhfjf`) calls `change_asset_status`, which exists only after migration `20261020090000_department_follows_person`. Cloudflare deploys `main` automatically, but migrations are pushed by hand.
- **Risk if it's missing:**
  - Change status, Change department and Edit accessories fail with "function not found".
  - A person's department change doesn't move their items.
  - The one-time fix for items showing "Common" hasn't run.
- **Fix:** run `npx supabase migration list` while linked to PROD. If it's missing, `npx supabase db push` to PROD, then link back to DEV. See also M4.

**H2. A held item made Faulty or Under Repair breaks at "Back from repair → Spare".**
- **Evidence:**
  - `change_asset_status` refuses Spare while held, but allows Faulty and Under Repair while held, and keeps the holder.
  - `send_for_repair` accepts Faulty and never clears the holder.
  - `back_from_repair` never touches the holder.
  - The check `assets_spare_has_no_holder` then rejects the update, and Sahan sees a raw database error.
  - Before PR #19 a held item could only become Faulty through Return, which clears the holder, so this is a regression.
- **Repro (read from the code, not run):** an In Use laptop → Change status → Faulty → Send for repair → Back from repair (fixed, Spare) → error.
- **Fix (pick one):**
  - **(a)** `change_asset_status` refuses Faulty and Under Repair while held: "use Return as Faulty". This is simplest and matches how Return already works.
  - **(b)** `back_from_repair` clears the holder (and department) when the item comes back Spare, with a Change Log note.
  - Either way, add a test for this path to `supabase/tests/department.sql`.

**H3. Real staff data, NIDs included, is committed to the repository.**
- **Evidence:** `git ls-files data/` lists `data/IT_Asset_Inventory_Phoenix_BPO.xlsx`, which holds real names and real NIDs. `.gitignore` deliberately force-tracks it. `data/README.txt` records it as Sahan's call, and the repo is private.
- **Risk:** it conflicts with `CLAUDE.md` ("Never commit real staff data"). Every clone, fork and backup of the repo carries the NIDs.
- **Fix:** decide deliberately. Either:
  - `git rm --cached` the workbook, drop the `!data/IT_Asset_...` line from `.gitignore`, and optionally purge it from history; or
  - record in `CLAUDE.md` that this one file is an accepted exception, and why.

### Medium

**M1. A Lost / Stolen item traps its holder: they can't be marked Left.**
- **Evidence:** Lost / Stolen keeps the holder, which is intentional so the record shows who had it. But:
  - `return_assets` refuses anything not In Use;
  - `employees_left_guard` refuses Left while the person holds any asset;
  - the only ways out are Retire or Dispose (which clear the holder), or changing it back to In Use and Returning it.
- **Fix:** let Return accept Lost / Stolen items, or let the leaver rule ignore Lost / Stolen. Say so on the Mark as left screen.

**M2. Logged-out uploads to `reports/` have no limit.**
- **Evidence:** storage policy `photos_bucket_anon_report` lets anyone with the public key upload `reports/<uuid>.jpg` (5 MB each, any number). The rate limit applies to `submit_fault_report`, not to the uploads.
- **Risk:** low effort, but it could fill the 1 GB free-tier storage, which would stop photo uploads for everyone.
- **Fix:** a `security definer` check in the policy (for example, at most N objects in `reports/` per hour), or a periodic clean-up of unreferenced `reports/` files.

**M3. Go-live is only partly done, and the docs don't say so.**
- **Evidence:** 32 boxes in `docs/GO_LIVE.md` and the four Go-live boxes in `docs/BUILD_PLAN.md` Phase 5 are unticked, though PROD is migrated, imported and serving.
- **Unverified:**
  - viewer accounts for the boss and HR;
  - "Allow new users to sign up" off on PROD;
  - GitHub secrets set, with **Keep Supabase awake** and **Weekly backup** run green;
  - a restore tested into DEV;
  - `npm run smoke` on PROD;
  - a real QR scan.
- **Fix:** walk through `GO_LIVE.md` and tick as you go. Without keep-alive, PROD pauses after a week idle. Without a tested backup, there's no recovery.

**M4. Code and database deploy separately, with no guard on the order.**
- **Evidence:** merging to `main` deploys the frontend at once; migrations need a manual `db push`. H1 is the result.
- **Fix:** push migrations **before** merging, and add a line to the PR description template saying so. A small CI check could also fail when `supabase/migrations/` changed and the PR doesn't say "pushed to PROD". Keep any new function backwards-tolerant where possible.

**M5. Dummy NIDs and unset numbers in PROD weaken the data.**
- **Evidence:**
  - 15 people were imported with dummy NIDs (`9000000000xx`), which the boss and HR would see.
  - `min_spares` is 0 for all 21 categories, so the spare-pool warning never fires.
  - The AC service interval is still the 90-day placeholder (`CLAUDE.md` open decision 4).
- **Fix:** replace the NIDs in People → Edit. Don't re-import, which would duplicate people. Set minimum spares and the AC interval in Settings → Categories.

**M6. The SQL tests and API RLS tests don't run in CI.**
- **Evidence:** `.github/workflows/ci.yml` runs lint, unit tests and build only. The 9 SQL suites need a local Supabase in Docker, and `npm run test:rls` needs test accounts.
- **Risk:** a migration can break a rule, or RLS, without CI noticing.
- **Fix:** add a CI job that starts Supabase with `supabase start` (Docker is available on GitHub runners), applies the migrations and runs the SQL suites.

**M7. Stock can drift from reality, by design.**
- **Evidence:** Edit accessories (`set_asset_accessories`) and the import tick accessories without moving stock. That's correct for a correction, but the count then depends on Sahan remembering Stock → Adjust.
- **Fix:** keep the behaviour. Consider a short "check stock?" link after saving accessories, and a periodic stock-take.

### Low

| # | Finding | Fix |
|---|---|---|
| L1 | **Dead code from removed features:** location fields still selected in 9 queries; `useLocations`, `LOCATION_KIND_LABELS`, `pickSpellings` and the import's location plumbing unused; DB views `v_asset_costs`, `v_spend_monthly` and functions `move_asset`, `swap_asset` unused. | Remove from the frontend. Keep the DB objects (never delete) or note them as deprecated in `SCHEMA.md`. |
| L2 | `import_workbook` sets an asset's department from its own row, so a sheet can give a held item a department different from its holder's (until the person's department next changes). | In the import, take a held asset's department from its holder. |
| L3 | The handover form and leaver sheet now show a half-empty row ("Contact no." plus a blank pair) where Location / desk was. | Lay out the employee details as 5 cells, or fill the slot with Joined on. |
| L4 | Some pages are large: `FaultPage.tsx` about 600 lines, `ReturnPage.tsx` about 500, `IssuePage.tsx` about 450. | Split into sections when next changed. |
| L5 | Remote branches carry stray commits: "Add launch configuration…" on 3 branches, and an unmerged "short go-live checklist" on `claude/phase-0-plan-epdv45`. Merged branches were never deleted. | Merge or drop the checklist commit; delete merged branches. |
| L6 | Local copies with real names: `data/Phoenix_import_2026-10-15.xlsx` (superseded, wrong tags), `data/Phoenix_import_combined_2026-10-15.xlsx` and `data/test_nid_fixed.xlsx`. They're gitignored. The local Docker database also holds the imported staff list. | Delete the two test files; keep the combined file only until import. `npx supabase stop` and reset the local DB when done. |
| L7 | No `README.md` at the repo root; the onboarding is spread across `CLAUDE.md` and `docs/`. | A short README pointing to `docs/USER_GUIDE.md`, `GO_LIVE.md` and `RESTORE.md`. |
| L8 | The Import page is still deployed at `/import` (hidden, admin-only), kept for go-live. | Delete it and its code once PROD's data is final (as `GO_LIVE.md` says). |
| L9 | Exports (Assets, People, the full workbook) contain NIDs, and viewers can export. This is by design. | Remind the boss and HR that exported files are personal data (`USER_GUIDE.md` already says so for screens). |
| L10 | `LabelsPrintPage` uses `dangerouslySetInnerHTML` for the QR SVG. It's safe today: the SVG is generated locally from a tag the database restricts to `PBS-XXX-000`. | Keep the tag check constraint; don't feed other text into it. |
| L11 | The local `supabase/config.toml` has `enable_signup = true`. It's harmless locally, but would be wrong if pushed. | Never run `supabase config push` from this file without setting it to false. |
| L12 | Minor dependency updates available (react 19.3.1, @tanstack/react-query, lucide-react, supabase CLI). TypeScript 7 is a major release. `npm audit` shows 0 vulnerabilities. | Routine update; hold TypeScript 7 until the toolchain supports it. |

---

## Business rules (from `CLAUDE.md`)

| # | Rule | Status | Notes |
|---|---|---|---|
| 1 | Mice and keyboards are accessories; ticking at issue moves stock | ✅ | Stock can't go below 0 (trigger). Corrections don't move stock (M7). |
| 2 | Tagged assets get their own row and tag | ✅ | Tags never change; numbers never reused. |
| 3 | Department, not location; held items follow the person | ✅ code / ⚠️ PROD | Trigger plus one-time fix (H1: is it on PROD?). Import can break it (L2). |
| 4 | Never delete | ✅ | No delete in the UI. Only unused lookup rows (vendor, accessory type, location) can be deleted, by the admin. |
| 5 | Change Log and asset never disagree | ✅ / ⚠️ | Guard trigger plus one function per action. Imported assets start without a Received row, by design. H2 is an error path, not a disagreement. |
| 6 | Work on assets is a service job | ✅ | One job, many lines, next due from the category interval. |
| 7 | Each cost in one place | ✅ | A fault linked to a service line is forced to cost 0 (trigger). |
| 8 | A fault records who reported it and who held it | ✅ | The holder is filled in automatically. |
| 9 | Spare pool warns below `min_spares` | ⚠️ | Works, but every category is 0 (M5). |
| 10 | Repair vs replace | removed | Per Sahan, 15/10/2026. |
| 11 | Reminders within 30 days | ✅ | Colombo dates throughout (migration `colombo_dates`). |
| 12 | Handover form, with the `HO-` number on the Change Log rows | ✅ | Cosmetic gap after the location removal (L3). |
| — | Leaver flow | ⚠️ | Lost / Stolen items block "Mark as left" (M1). |

## Security posture

| Check | Result |
|---|---|
| RLS enabled on every `public` table | ✅ all; none use `force` |
| Views use `security_invoker` | ✅ all |
| `security definer` functions pin `search_path` | ✅ all |
| Write functions check the admin | ✅ (`retire_asset` and `dispose_asset` through `_end_of_life`) |
| What a logged-out visitor can call | ✅ only `get_public_asset`, `submit_fault_report`, `ping` |
| What a logged-out visitor can read | ✅ nothing (`npm run smoke` on DEV: "All clear") |
| Write policies | ✅ every insert, update and delete policy is `is_admin()` |
| Audit log | ✅ admin-only read; the page is gone, the data is kept |
| Storage | ✅ private bucket, admin uploads into known folders, viewers read. ⚠️ unlimited logged-out uploads (M2) |
| NIDs in URLs, errors or logs | ✅ search text is never put in the address; errors show friendly text only, never Postgres `details`; console logs only the error type |
| Public report page | ✅ tag, category, make and model only; rate-limited (HTTP 429) |
| Headers on the live site | ✅ strict CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY` (HTTPS is enforced by the `.dev` domain) |
| Secrets | ❌ C1 (in history); ✅ none in the current code or bundle (only the publishable key) |
| Dependencies | ✅ `npm audit`: 0 vulnerabilities |

## Code health

| Check | Result |
|---|---|
| Lint / types | ✅ ESLint clean; `tsc --noEmit` clean |
| Unit tests | ✅ 172 passed (32 files); the two exceljs tests have a 20 s timeout to avoid flaky CI |
| SQL tests | ✅ 9 suites pass on a fresh local database (not in CI: M6) |
| Bundle | ✅ main about 125 kB and app about 134 kB gzipped; exceljs (about 256 kB) lazy-loaded; the public report page is its own small chunk |
| Data freshness | ✅ every action refreshes the lists it changes (fixed 15/10/2026) |
| Timezone | ✅ the database and the screens use the Colombo date |
| Error handling | ✅ error boundary, "Could not reach the server" with retry, friendly constraint messages |
| Leftovers | ⚠️ L1 dead code; L8 Import page |

## UX

**Works well:**
- **Home:** "Needs attention" first, with alike reminders grouped.
- **Menu:** grouped, with a fault count; Faults is on the phone bar.
- **Asset page:** who has it first, the everyday actions up front, the rare ones in a menu.
- **Group by:** Department, Person, Category or Status.
- **New joiners:** "Save and issue devices", one-tap spares, remembered accessories, and a stock check before saving.
- **Phone:** the pages checked fit a 375 px screen.

**Gaps:**
- M1 (Lost / Stolen leaver dead end).
- H2 (a raw database error on the repair path).
- L3 (the half-empty print row).
- No search box in the header: each list has its own search, which is fine at this size.
- Viewers see dummy NIDs until M5 is done.

## Deployment

| Item | State |
|---|---|
| Hosting | Cloudflare Pages, auto-deploys `main`; the live build is PR #19, pointed at PROD (`cgopxhy…`), with `VITE_PUBLIC_APP_URL` set |
| Database | PROD migrations: **unverified** (H1); DEV: up to date, smoke "All clear" |
| CI | lint, unit tests and build on PRs and `main`; no SQL tests (M6) |
| Keep-alive / backup | Workflows exist; secrets and runs **unverified** (M3) |
| Order of deploys | Code before database is possible (M4) |
| Branches | Stray commits and stale branches (L5) |

## Docs

| Document | State |
|---|---|
| `CLAUDE.md` | Current (rules 3, 5, 8, 10 updated 15/10/2026). Open decisions 2 (HR access), 4 (per-category numbers) and 5 (AC rooms and vendor) are still open. |
| `docs/SCHEMA.md` | Current, including the department trigger, the new functions and the unused location columns. |
| `docs/BUILD_PLAN.md` | History is accurate. The Phase 5 Go-live boxes are not ticked (M3). |
| `docs/GO_LIVE.md` | The steps are right; nothing is ticked (M3). |
| `docs/RESTORE.md` | Current. A restore has never been confirmed on this setup (M3). |
| `docs/USER_GUIDE.md` | Matches the app. Could add a line that exported files are personal data (L9). |
| README | Missing (L7). |

## Unverified items for Sahan to confirm

- [ ] C1: the old secret keys are deleted in both Supabase projects
- [ ] H1: `20261020090000_department_follows_person` shows as applied on PROD
- [ ] M3: "Allow new users to sign up" is off on PROD
- [ ] M3: the boss and HR have accounts with `viewer` profiles
- [ ] M3: GitHub secrets are set; Keep Supabase awake and Weekly backup have run green
- [ ] M3: a backup has been restored into DEV
- [ ] M3: `npm run smoke` on PROD ends with "All clear"
- [ ] M3: a real QR scan from a logged-out phone files a report
- [ ] M5: the dummy NIDs are replaced; minimum spares and the AC interval are set
