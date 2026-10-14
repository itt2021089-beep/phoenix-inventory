# Build plan

Work through the phases in order. At the start of each phase, present a plan and wait for Sahan's
OK. Tick tasks off (`[x]`) as you finish them. A phase is done only when its "Done when" checks pass
and the RLS checklist at the bottom passes.

---

## Phase 0: Setup

- [x] Sahan creates:
  - [x] a private GitHub repo `phoenix-inventory` containing `CLAUDE.md`, `docs/` and `.gitignore`
  - [x] Supabase projects `phoenix-inventory-dev` and `phoenix-inventory-prod`, in the closest region
    (Mumbai, or Singapore)
  - [x] Supabase settings: in Authentication, disable new sign-ups
- [x] Scaffold Vite + React + TypeScript in this folder, keeping the existing files ("Ignore files and
  continue", or scaffold in a temp folder and move the files in).
- [x] Add the stack:
  - [x] Tailwind + shadcn/ui
  - [x] React Router, TanStack Query, react-hook-form + zod
  - [x] ESLint + Prettier, Vitest
  - [x] `vite-plugin-pwa` (name "Phoenix Inventory", simple icon)
- [x] Environment files:
  - [x] `src/lib/supabase.ts` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
  - [x] commit `.env.example`; `.env.local` stays gitignored
- [x] Supabase CLI: `npx supabase init`, then link the DEV project.
- [x] Migration `profiles_and_roles`:
  - [x] the `profiles` table
  - [x] the `is_admin()` and `is_viewer_or_admin()` helpers
  - [x] RLS
- [x] In DEV, create Sahan's user (dashboard, auto-confirm) and give it an `admin` profile row.
- [x] App shell:
  - [x] login page, auth guard, "no access" screen for users without a profile
  - [x] layout: sidebar on desktop, bottom nav on phone
  - [x] role badge and logout
- [x] Cloudflare Pages:
  - [x] connect the GitHub repo; build `npm run build`, output `dist`
  - [x] env vars point at DEV for now
  - [x] add `public/_redirects`

**Done when:**
- the deployed URL loads, and Sahan can log in
- a test user without a profile sees only the "no access" screen
- the app can be installed from Chrome or Edge

**Phase 0 done (13/10/2026).**
- Sahan confirmed all three checks above on the deployed site.
- `npm run test:rls` passes 11/11 against DEV.
- New sign-ups are disabled on both DEV and PROD; checked through each project's auth settings.

---

## Phase 1: Replace the Excel sheet

### Database
- [x] Migration `lookups`, with seeds from SCHEMA.md:
  - [x] departments, locations, categories, vendors, stock_items, accessory_types, settings
- [x] Migration `core`:
  - [x] employees, assets, asset_accessories, handover_forms, change_log, audit_log
  - [x] the number sequences
  - [x] the `updated_at` and audit triggers, and the asset guard trigger
- [x] RPCs: `next_asset_tag`, `add_assets`, `issue_assets`, `return_assets`, `transfer_assets`,
  `move_asset`, `retire_asset`, `dispose_asset`.
  - Stock deduction inside `issue_assets` / `return_assets` can be a no-op until Phase 2 adds
    `stock_movements`.
- [x] Views: `v_category_summary`, `v_department_summary`, `v_employee_holdings`, `v_dashboard`
  (the counts it needs so far).
- [x] RLS on everything, then run the checklist. (14/10/2026: `npm run test:rls` 66 passed and 1
  skipped on DEV, the skip needing an issued asset; 67/67 on a local copy with one issued.)

### Screens
- [x] **Dashboard v1:**
  - counts by status, by category and by department
  - spares per category
  - an "In Use with no person and no location" warning
- [x] **Assets list:**
  - search by tag, serial, person or model
  - filter by category, status, department or location
  - Excel export of the filtered list
- [x] **Asset page:**
  - details, accessories and the timeline (Change Log rows, newest first)
  - action buttons that match the status (Issue, Return, Transfer, Move, Retire, Dispose).
    Move, Retire and Dispose work here; Issue, Return and Transfer open the screens below.
- [x] **Add asset:**
  - the tag is assigned automatically
  - the category's custom fields render automatically
  - make/model autocomplete from earlier entries
  - "Duplicate this asset"
- [x] **Bulk add:** category + quantity + common fields + optional serial list → creates the tags in
  one go and shows them.
- [x] **People:**
  - list, plus add/edit with NID validation (strip a leading "NIC" and spaces)
  - employee page showing what they hold, including accessories
  - "Mark as left", blocked while they still hold items (show the list)
- [x] **Issue** (the most used screen, phone-friendly):
  1. pick the employee
  2. pick Spare assets by search or tag
  3. for each asset, set condition and tick accessories
  4. location defaults to the employee's desk; date defaults to today
  5. Save, then the "Print handover form" option
- [x] **Return** and **Transfer** screens, built the same way.
- [x] **Handover form print page:** see the spec below.
- [x] **Settings:**
  - categories (prefix, min spares, typical replacement cost, service interval, custom fields editor)
  - accessory types (with stock link), departments, locations, vendors
- [x] **Import from workbook:** see the mapping below. The Fault Log tab and the Consumables
  quantities are imported in Phase 2, with the tables they need (decided 13/10/2026). Until then
  the preview lists them as "imported in Phase 2".
  - Uses the admin-only `import_workbook` RPC (in docs/SCHEMA.md), so the existing CHG numbers and
    dates are kept rather than re-issued.
- [x] **Export to Excel:** see the spec below.

**Done when:**
- Sahan's real workbook imports with no unexplained warnings
  (14/10/2026: it does. 17 register rows became 11 assets and 6 accessory ticks, 6 people, 6
  locations and 11 Change Log rows, with only the two "imported in Phase 2" notes. The next
  tags it worked out, PBS-LAP-007 and PBS-HST-006, match the workbook's own Next Free Tag
  column. First tried on a throwaway local copy of the database, then imported into DEV, which
  now holds the same counts: 11 assets, 6 people, 11 change rows, 13 accessory ticks.)
- issuing a laptop and a headset with Charger and Mouse ticked takes one screen and prints a correct
  HO form
  (Tried end to end in a browser on a local copy, with fake people: one screen, HO-0001 on one
  A4 page. Not tried on DEV, which now holds real data and has no Spare asset to issue.)
- the export opens in Excel with the same tabs and column headers as today's workbook
  (Compared with the original: every shared tab has identical column headers. It adds an empty
  Service Log tab for Phase 2, and leaves out README and Lists, which were notes and dropdown
  sources rather than data.)
- a viewer can see everything and change nothing
  (`npm run test:rls` passes 67/67 on DEV: every table, view and action refuses a viewer, and
  a logged-out visitor or a user with no profile reads nothing. The browser run on the local copy
  shows no write buttons and "Only IT can do this" on every admin URL.)

**RLS checklist, 14/10/2026:** `supabase/tests/rls.sql`, `actions.sql` and `import.sql` pass on a
local copy that mimics Supabase's default grants, and `npm run test:rls` passes 67/67 on DEV, with
the guard-trigger check now running because DEV has issued assets.

---

## Phase 2: Faults, services, photos, consumables

- [x] Migration `stock_movements` plus its trigger. Turn on the accessory → stock link in issue and
  return.
  - Stock never goes below 0: an issue that would do so is refused with the reason ("Optical mouse
    stock is 0. Untick Mouse, or receive stock first"), and nothing is saved (Sahan, 14/10/2026).
- [x] Import the workbook's Fault Log tab and the Consumables opening movements (deferred from
  Phase 1), extending `import_workbook`.
- [x] Migration `faults_and_service`: fault_log, service_jobs, service_lines and their RPCs
  (`record_service_job`, `send_for_repair`, `back_from_repair`).
  - Create service_lines before fault_log, or add the `service_line_id` FK afterwards.
- [x] **Fault inbox and fault page** (PR B, 14/10/2026):
  - status flow Open → In Progress → With Vendor → Closed
  - vendor and cost, plus an "Under warranty" tick
  - **Investigation** section (admin only): cause, responsible person, notes
  - "Fixed in service job" link: forces the fault's cost to 0
- [x] Open a fault directly from the Return screen and from the asset page.
- [x] **New service job screen:**
  - vendor, date, type, invoice no, invoice total
  - add several assets (filter by category or room), with work done and cost per line
  - next due date filled in automatically
  - warning when the line costs don't add up to the invoice total
- [x] **Photos** (PR C, 14/10/2026; helper resizes to 1600 px / about 200 KB before upload; private bucket; signed URLs):
  - [x] 1–3 condition photos at issue and at return
  - [x] fault photos
  - [x] signed handover copy
  - [x] invoice photo on a service job
  - [x] asset page: "At issue" vs "At return" photos side by side
- [x] **Stock page** (PR D, 14/10/2026): list with reorder flags; receive, issue, adjust and write off.
  Also: add a stock item, edit its reorder level, history per item, and Qty Received / Qty Issued
  in the Consumables export (counted from the movements).
- [x] Asset page: "Repair spend so far" and the service history.
- [ ] Record the real AC job (HR room, CEO room, Sales room) as the first service job, after creating
  the AC assets. **Sahan does this himself** with the real rooms, vendor and invoice (open decision 5):
  Assets → Add asset (Air Conditioner, quantity 3), Move each to its room, then Service → New
  service job → Air Conditioner → Add all 3.

**Done when:**
- the AC job shows as one SRV job with 3 lines and next due dates
- a fault opened on return appears in the inbox
- issue/return photos show side by side
- ticking "Mouse" at issue reduces the Optical mouse stock by 1

**Phase 2 checks, 14/10/2026** (local copy shaped like Supabase, fake people; DEV untouched):
- the SQL suites `rls.sql`, `actions.sql`, `import.sql`, `faults_service.sql` and `photos.sql` pass,
  and `npm run test:rls` passes 94/94 on DEV, including the photo upload refusals
- browser runs: the three-room AC job saves as one SRV job with 3 lines and next due dates; a fault
  opened on return is in the inbox; At issue / At return photos sit side by side; ticking Mouse at
  issue takes the Optical mouse stock from 9 to 8 and returning it puts it back
- still to do on DEV by Sahan: re-import the workbook (brings FLT-0001 and the 8 mice; DEV shows 0
  faults and 0 mice until then), and record the real AC job (above)

---

## Phase 3: QR labels and staff fault reports

- [x] Route `/a/:tag`:
  - logged in → the asset page
  - logged out → the public report page
- [x] RPCs `get_public_asset` and `submit_fault_report` (with the rate limit), plus the anon storage
  policy for `reports/` (Phase 3 PR A, 15/10/2026; also `ping`). Two limits (Sahan, 15/10/2026):
  3 QR reports per asset per hour, and 20 an hour across all assets (`report_rate_limit_total`).
  Only logged-out callers may file a report; a viewer writes nothing.
- [x] **Public report page** (Phase 3 PR B, 15/10/2026; must work on a cheap Android phone and on mobile data):
  - load it as its own small chunk (route-level `React.lazy`), without the admin app: in Phase 1
    the main bundle is ~220 kB gzipped, mostly react-dom, supabase-js, zod and react-router
  - shows tag, category, make and model only
  - fields: your name, what's wrong, optional photo
  - a thank-you screen with the FLT number
- [x] Fault inbox:
  - "New from QR" badge
  - match `reported_by_name` to an employee in one click
- [x] **Label printing page:**
  - choose tags, or "all assets without a printed label"
  - sets `label_printed_at`
  - see the label spec below

**Done when:**
- scanning a label with a logged-out phone files a report that appears in the inbox
- logged-out REST calls with the publishable key return nothing from any table or view

**Phase 3 checks, 15/10/2026** (production build on a local copy shaped like Supabase, fake people;
DEV untouched except by `npm run test:rls`, whose logged-out checks only make calls that must be
refused):
- a logged-out phone opened `/a/<tag>`, saw only tag, category, make and model (no name, no NID),
  sent a report with a 1.7 MB photo (stored at about 200 KB under `reports/`), got its FLT number,
  and the report appeared in the inbox with a "New from QR" badge; one click matched the typed
  name to a person without touching who held the item
- the fourth report on one asset within an hour was refused in words (HTTP 429)
- logged-out REST calls on 12 tables and views were refused, three write functions were refused,
  and an upload outside `reports/` was refused
- the labels page printed one A4 sheet; the QR holds only `<app URL>/a/<tag>`; a part-used sheet
  and other label sizes lay out correctly; labels are marked printed only after Sahan confirms
- still to prove on DEV by Sahan: a real scan from a logged-out phone (the real Storage rule for
  `reports/`), and printing a real sticker sheet

---

## Phase 4: Spare pool, reminders, repair vs replace

- [x] Views `v_due_soon`, `v_asset_costs`, `v_stock_levels`, and the rest of `v_dashboard`.
- [x] Settings page: edit the thresholds (repair %, repeat faults, reminder window, rate limit).
- [x] **Dashboard panels:**
  - Due in the next 30 days: warranty and service, with overdue in red
  - Spare pool vs minimum
  - Stock to reorder
  - Open faults
  - Repair-vs-replace flags
- [x] **Swap action** (`swap_asset`), on the asset page and on a fault page that is still with its holder
  (Phase 4, 16/10/2026). Same category only; with no spare it says so. The old asset becomes Faulty in
  the IT store (not Under Repair), so Send for repair takes it from there.
- [x] **Reports page**, each report exportable:
  - repair-vs-replace list with the numbers
  - repair and service spend per department per month
  - faults by cause
  - service history by vendor
- [x] **Leaver clearance print page:** everything the employee holds, including accessories, with
  signature lines for IT and HR.

**Done when:**
- an asset with repairs ≥ 50% of its replacement basis shows as flagged
- a category below its minimum spares turns red
- a warranty ending within 30 days shows on the dashboard

**Phase 4 checks, 16/10/2026** (production build on a local copy shaped like Supabase, fake people):
- a laptop with LKR 60,000 on a fault and LKR 50,000 on a service line (55% of a typical LKR 200,000)
  is flagged, with the reason; raising the threshold to 60% un-flags it
- the Laptop row turns red when the spare pool drops below its minimum of 2 (after two swaps)
- three AC warranties ending in 10 days show under "Due in the next 30 days"; a service 100 days
  ago on a 90-day interval shows 10 days overdue, in red, at the top; a 5-day window drops the
  warranties but keeps the overdue service
- swap from the asset page and from a fault page; with no spare left it says so
- all four reports show the right numbers and export; the leaver sheet prints on one A4 page and a
  viewer (HR) can print it
- `phase4.sql` and the other five SQL suites pass; `rls.api.test.ts` gains Phase 4 checks that
  need the new migration on DEV (run `npx supabase db push` first)
- the flags need numbers from Sahan: set each category's typical replacement cost and minimum
  spares in Settings (open decision 4); an asset with neither a purchase price nor a typical cost
  is marked "none set" in the report and cannot be flagged on spend

---

## Phase 5: Hardening and go-live

- [x] `.github/workflows/keepalive.yml`:
  - every 3 days, call `ping()` with the publishable key
  - secrets `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`
- [x] `.github/workflows/backup.yml`:
  - weekly `pg_dump` of PROD (secret `SUPABASE_DB_URL`)
  - encrypt with `gpg --symmetric` (secret `BACKUP_PASSPHRASE`)
  - upload as a workflow artifact with 90-day retention
  - photos are not included; say so in `docs/RESTORE.md`, together with the restore steps
- [x] Audit log viewer (admin only): `/audit`, with filters, before/after detail, paging and export.
  The log is now readable by the admin only (migration `audit_log_admin_only`), because its rows
  hold copies of NIDs.
- [x] Loading, empty and error states on every page (an error boundary for crashes, a plain "could
  not reach the server" for a lost connection).
- [ ] Install-as-app tested on a Windows laptop (Chrome or Edge) and an Android phone. **Sahan:**
  the manifest, icons and service worker are checked by script (below); the real devices are not.
- [ ] **Go-live** (all touch PROD, so Sahan does them; step by step in `docs/GO_LIVE.md`):
  - [ ] push the migrations to PROD
  - [ ] import the real workbook into PROD
  - [ ] create the boss and HR viewer accounts
  - [ ] switch the Cloudflare env vars to PROD
- [x] `docs/USER_GUIDE.md`: one page for the boss and HR (log in, read the dashboard, print a
  clearance sheet).
- [x] Also added: `docs/RESTORE.md`, `docs/GO_LIVE.md`, `npm run smoke` (a read-only check of a live
  project as a logged-out visitor), security headers in `public/_headers`, and a CI workflow
  (lint, test, build) in `.github/workflows/ci.yml`.

**Done when:**
- PROD is live
- one backup has run and been restored into DEV successfully
- the boss and HR can log in and view

These three need Sahan (PROD, the GitHub secrets and the accounts), so they are still open.

**Phase 5 checks, 14/10/2026** (production build on a local copy shaped like Supabase, fake people;
`npm run smoke` on DEV, read-only):
- backup and restore, end to end on the local copy: `scripts/backup.sh` then
  `scripts/restore-backup.sh` into a second database; 18 tables identical row for row, sequences
  carried over (numbering continues), guard triggers working after the restore. A wrong passphrase
  and a wrong host name are both refused with a plain message.
- a sweep of all 37 pages, in two modes: against an empty database, and with the server cut off
  after sign-in. Every page shows an empty message or "Could not reach the server", never a blank
  page, "Loading..." forever or a raw error. Found and fixed on the way: a lost connection at
  sign-in said "Ask IT for access" (now "Could not reach the server" with Try again), and a failed
  read kept "Loading..." up for 15 s (the Supabase client already retries, so the second retry in
  TanStack Query is off).
- the page crash screen is covered by a unit test (a component that throws shows the plain screen
  and logs only `The page crashed (<name>).`); it was not forced in a real browser
- the Content-Security-Policy and the other headers in `public/_headers` were applied by a small
  server that reads the file. The admin pages, public report page, photos, stock, faults and label
  suites all pass with the policy enforced and no violations. The headers are not tested on
  Cloudflare itself: look at `https://<your-site>/` in the browser's Network tab after the first
  deploy.
- `/audit`: 123 fake rows page in 50 at a time, the filters narrow, a row opens to show before and
  after, the export downloads, a viewer has no link and sees nothing at `/audit`.
- install-as-app, by script only: a valid manifest, 192 and 512 px icons (one maskable), an active
  service worker, and the app shell opens with the network off.
- `npm run smoke` on DEV: "All clear" (nothing readable logged out, 14 write functions refused,
  photo bucket private, sign-ups disabled).
- all 7 SQL suites pass on a fresh database; `rls.api.test.ts` passes 125 on the local copy. The
  new audit tests need the migration on DEV (`npx supabase db push`) before `npm run test:rls`
  passes there.

### Later (not scheduled)
- Email reminders through custom SMTP, using the company mailbox.
- Stock-take mode: walk the office scanning labels; the app lists what wasn't scanned.
- HR editing of joiners and leavers, if Sahan approves (open decision 2).

---

## Spec: workbook import (Phase 1)

The source is Sahan's `IT_Asset_Inventory_Phoenix_BPO.xlsx`. It lives in `data/` (gitignored) or is
uploaded on the Import page.
- The import runs in the browser as the logged-in admin, parsed with exceljs. No secret key is
  needed.
- It shows a preview with warnings first, and writes only after Sahan confirms.
- It is safe to re-run: upsert by `asset_tag`, NID, `change_no` and `fault_no`.
- Imported accessories don't create stock movements.

| Tab | Mapping |
|---|---|
| **Lists** | Check the categories and prefixes against the seeds. Create any extra category, except Mouse and Keyboard. |
| **Asset Register** (row 2 on; stop at the first empty Asset Tag) | **Mouse and Keyboard rows are not assets.** Add accessory "Mouse"/"Keyboard" to the laptop or desktop held by the same NID, and skip their Change Log rows. All other rows become assets, with the Status and Condition labels converted to codes. A Model of "TBC" becomes null, with the note "model to confirm". The "Open Faults" and "Times Repaired" columns are ignored (they're calculated). |
| ↳ Assigned To + NID No. | Employees, de-duplicated by the normalised NID (strip "NIC", spaces; uppercase). Names in Title Case ("sahan samidhu" → "Sahan Samidhu"). The department comes from the row; the default location is the row's Location / Desk. |
| ↳ Location / Desk | Locations, de-duplicated case-insensitively ("travel section" = "Travel section"). Keep the most common spelling. |
| ↳ Notes (laptops) | The words charger, mouse, mouse pad and bag become accessory ticks. The remaining detail goes to `accessories_note` (for example "Charger: Lenovo 65W" → Charger ticked + note "Lenovo 65W"). Any other text goes to `notes`. |
| ↳ Specification | `specification` |
| **Change Log** | Keep the CHG numbers. "IT Store" in From becomes `from_location` = IT store. **To** (e.g. "Travel User 1") is resolved to the asset's current assignee in the Asset Register, because the register is the truth and the log used placeholders. Empty Handover Form No becomes null. |
| **Fault Log** | Keep the FLT numbers. "fix by supplier (lanka pc)" → create vendor "Lanka PC", link it, and keep the text as `action_taken`. Cost 0, status Closed, date closed. `under_warranty` = false (Sahan, 14/10/2026). |
| **Consumables** | `MOU-0001` "optical mouse" → stock item `CON-001` "Optical mouse" with reorder level 10. Two movements: received 30 and issued 22 (reference "Opening balance from Excel"). Link accessory "Mouse" to it. |
| **After import** | Each category's `next_tag_number` = highest imported number + 1. Move the CHG and FLT sequences past the highest imported numbers with `setval`. |

Preview warnings: duplicate tag, serial or NID; unknown category; In Use with no person and no
location; an NID in the wrong format; and anything the mapping didn't recognise.

## Spec: Excel export (Phases 1–2)

- File name: `IT_Asset_Inventory_Phoenix_BPO_<YYYY-MM-DD>.xlsx`.
- Header row bold and frozen, autofilter on, sensible column widths.
- Values only, no formulas.

| Tab | Columns |
|---|---|
| Asset Register | Asset Tag, Category, Make, Model, Serial Number, Status, Condition, Assigned To, NID No., Department, Location / Desk, Date Assigned, Specification, Notes (accessories + accessory note + notes), Open Faults, Times Repaired |
| Change Log | Log ID, Date, Asset Tag, Change Type, From, To, Reason / Details, Handover Form No |
| Fault Log | Fault ID, Asset Tag, Date Reported, Reported By, Fault / Issue, Action Taken, Cost (LKR), Date Closed, Status, Remarks, Vendor, Under Warranty, Cause, Responsible |
| Service Log | Job No, Date, Vendor, Type, Asset Tag, Location, Work Done, Cost (LKR), Next Due |
| Consumables | Item Code, Item, Qty Received, Qty Issued, In Stock, Reorder Level, Reorder?, Notes |
| Dashboard | The `v_dashboard` counts and `v_category_summary` as plain values |

## Spec: handover form print page (`/print/handover/:formNo`)

A4 portrait, matching the company's paper form, with everything pre-filled from the data:

1. **Header:**
   - "PHOENIX BPO SOLUTIONS" and "IT Equipment Handover Form"
   - Form No `HO-0001` and Date (DD/MM/YYYY)
2. **Purpose:** ☐ Issue to employee ☐ Return to IT ☐ Transfer to another employee. The right box is
   ticked.
3. **Employee details** (two-column grid): Employee name, NID No., Department, Designation,
   Location / desk, Contact no.
4. **Equipment table:**
   - columns: #, Asset Tag, Item (category), Make / Model, Serial No., Condition, Accessories
     included
   - at least 6 rows, more if needed
5. **Employee acknowledgement.** These bullets are printed exactly as written:
   - I have received the items listed above in the condition stated, and I have checked that they
     work.
   - I will use them for company work only, keep them secure, and not lend them to anyone.
   - I will not install unapproved software, remove asset labels, or open or modify the hardware.
   - I will report any fault, damage, loss or theft to IT on the same day.
   - I will return every item and accessory when I leave the company, change role, or when IT asks
     for it.
6. **On return: IT use only.**
   - Condition on return: ☐ Good ☐ Damaged ☐ Items missing
   - Data backed up / device reset: ☐ Yes ☐ Not needed
   - Remarks / missing items
   - Pre-tick and pre-fill these when the purpose is Return.
7. **Signatures:** three columns (Employee | IT (issued / received by) | Head of Department), each
   with Name, Signature and Date lines.
8. **Footer:** "Original → IT file. Copy → employee." Drop the old "record the Form No in the Change
   Log" line; that now happens automatically.

## Spec: QR labels (`/print/labels`)

- The QR encodes `${VITE_PUBLIC_APP_URL}/a/<asset_tag>`. Use the tag only; never the NID or a name.
- Label text: the tag in large bold monospace, "Phoenix BPO · IT", and "Scan to report a problem".
- Layout: grid on an A4 sticker sheet. Label size is a setting (default 50 × 25 mm), and there is an
  option to start at a given position so a half-used sheet can be reused.

## RLS checklist (run after every phase that touches SQL)

1. **Logged out (publishable key only):** a select on every table and view returns no rows. Only
   `get_public_asset`, `submit_fault_report` and `ping` can be called, and
   `submit_fault_report` only by them (a logged-in viewer is refused).
2. **Viewer:** can read everything. Every insert, update and delete fails, and every write RPC raises
   `not allowed`.
3. **Admin:** a direct update of `assets.status` or `assigned_employee_id` fails (guard trigger). The
   same change through the RPC works and writes a Change Log row.
4. **Logged in with no profile row:** sees nothing.
   **Audit log:** a viewer reads no rows of `audit_log`; the admin reads them but cannot write,
   change or delete any.
5. **Logged out:** `submit_fault_report` called more than the rate limit allows for one asset within
   an hour gets refused.

`supabase/tests/import.sql` covers the import the same way. Automate this with an SQL test script (`supabase/tests/rls.sql`) or a small Vitest suite against
DEV, using test accounts and fake data. Both exist: `supabase/tests/rls.sql` (run with psql as
`postgres`) and `npm run test:rls` (`supabase/tests/rls.api.test.ts`, through the real API as the
`TEST_*` accounts in `.env.test.local`). Extend both as each phase adds tables.

## `.gitignore` additions

```
.env
.env.*
!.env.example
data/
*.xlsx
!tests/fixtures/*.xlsx
supabase/.temp/
```
