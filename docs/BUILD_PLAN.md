# Build plan

Work through the phases in order. At the start of each phase, present a plan and wait for Sahan's
OK. Tick tasks off (`[x]`) as you finish them. A phase is done only when its "Done when" checks pass
and the RLS checklist at the bottom passes.

---

## Phase 0: Setup

- [ ] Sahan creates:
  - [x] a private GitHub repo `phoenix-inventory` containing `CLAUDE.md`, `docs/` and `.gitignore`
  - [ ] Supabase projects `phoenix-inventory-dev` and `phoenix-inventory-prod`, in the closest region
    (Mumbai, or Singapore)
  - [ ] Supabase settings: in Authentication, disable new sign-ups
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
- [ ] Supabase CLI: `npx supabase init` (done — `supabase/config.toml` is committed), then link
  the DEV project. Linking needs the project ref and a Supabase access token.
- [x] Migration `profiles_and_roles`:
  - [x] the `profiles` table
  - [x] the `is_admin()` and `is_viewer_or_admin()` helpers
  - [x] RLS
- [ ] In DEV, create Sahan's user (dashboard, auto-confirm) and give it an `admin` profile row.
- [x] App shell:
  - [x] login page, auth guard, "no access" screen for users without a profile
  - [x] layout: sidebar on desktop, bottom nav on phone
  - [x] role badge and logout
- [ ] Cloudflare Pages:
  - [ ] connect the GitHub repo; build `npm run build`, output `dist`
  - [ ] env vars point at DEV for now
  - [x] add `public/_redirects`

**Done when:**
- the deployed URL loads, and Sahan can log in
- a test user without a profile sees only the "no access" screen
- the app can be installed from Chrome or Edge

---

## Phase 1: Replace the Excel sheet

### Database
- [ ] Migration `lookups`, with seeds from SCHEMA.md:
  - [ ] departments, locations, categories, vendors, stock_items, accessory_types, settings
- [ ] Migration `core`:
  - [ ] employees, assets, asset_accessories, handover_forms, change_log, audit_log
  - [ ] the number sequences
  - [ ] the `updated_at` and audit triggers, and the asset guard trigger
- [ ] RPCs: `next_asset_tag`, `add_assets`, `issue_assets`, `return_assets`, `transfer_assets`,
  `move_asset`, `retire_asset`, `dispose_asset`.
  - Stock deduction inside `issue_assets` / `return_assets` can be a no-op until Phase 2 adds
    `stock_movements`.
- [ ] Views: `v_category_summary`, `v_department_summary`, `v_employee_holdings`, `v_dashboard`
  (the counts it needs so far).
- [ ] RLS on everything, then run the checklist.

### Screens
- [ ] **Dashboard v1:**
  - counts by status, by category and by department
  - spares per category
  - an "In Use with no person and no location" warning
- [ ] **Assets list:**
  - search by tag, serial, person or model
  - filter by category, status, department or location
  - Excel export of the filtered list
- [ ] **Asset page:**
  - details, accessories and the timeline (Change Log rows, newest first)
  - action buttons that match the status (Issue, Return, Transfer, Move, Retire, Dispose)
- [ ] **Add asset:**
  - the tag is assigned automatically
  - the category's custom fields render automatically
  - make/model autocomplete from earlier entries
  - "Duplicate this asset"
- [ ] **Bulk add:** category + quantity + common fields + optional serial list → creates the tags in
  one go and shows them.
- [ ] **People:**
  - list, plus add/edit with NID validation (strip a leading "NIC" and spaces)
  - employee page showing what they hold, including accessories
  - "Mark as left", blocked while they still hold items (show the list)
- [ ] **Issue** (the most used screen, phone-friendly):
  1. pick the employee
  2. pick Spare assets by search or tag
  3. for each asset, set condition and tick accessories
  4. location defaults to the employee's desk; date defaults to today
  5. Save, then the "Print handover form" option
- [ ] **Return** and **Transfer** screens, built the same way.
- [ ] **Handover form print page:** see the spec below.
- [ ] **Settings:**
  - categories (prefix, min spares, typical replacement cost, service interval, custom fields editor)
  - accessory types (with stock link), departments, locations, vendors
- [ ] **Import from workbook:** see the mapping below.
- [ ] **Export to Excel:** see the spec below.

**Done when:**
- Sahan's real workbook imports with no unexplained warnings
- issuing a laptop and a headset with Charger and Mouse ticked takes one screen and prints a correct
  HO form
- the export opens in Excel with the same tabs and column headers as today's workbook
- a viewer can see everything and change nothing

---

## Phase 2: Faults, services, photos, consumables

- [ ] Migration `stock_movements` plus its trigger. Turn on the accessory → stock link in issue and
  return.
- [ ] Migration `faults_and_service`: fault_log, service_jobs, service_lines and their RPCs
  (`record_service_job`, `send_for_repair`, `back_from_repair`).
  - Create service_lines before fault_log, or add the `service_line_id` FK afterwards.
- [ ] **Fault inbox and fault page:**
  - status flow Open → In Progress → With Vendor → Closed
  - vendor and cost, plus an "Under warranty" tick
  - **Investigation** section (admin only): cause, responsible person, notes
  - "Fixed in service job" link: forces the fault's cost to 0
- [ ] Open a fault directly from the Return screen and from the asset page.
- [ ] **New service job screen:**
  - vendor, date, type, invoice no, invoice total
  - add several assets (filter by category or room), with work done and cost per line
  - next due date filled in automatically
  - warning when the line costs don't add up to the invoice total
- [ ] **Photos** (helper resizes to 1600 px / about 200 KB before upload; private bucket; signed URLs):
  - [ ] 1–3 condition photos at issue and at return
  - [ ] fault photos
  - [ ] signed handover copy
  - [ ] invoice photo on a service job
  - [ ] asset page: "At issue" vs "At return" photos side by side
- [ ] **Stock page:** list with reorder flags; receive, issue, adjust and write off.
- [ ] Asset page: "Repair spend so far" and the service history.
- [ ] Record the real AC job (HR room, CEO room, Sales room) as the first service job, after creating
  the AC assets.

**Done when:**
- the AC job shows as one SRV job with 3 lines and next due dates
- a fault opened on return appears in the inbox
- issue/return photos show side by side
- ticking "Mouse" at issue reduces the Optical mouse stock by 1

---

## Phase 3: QR labels and staff fault reports

- [ ] Route `/a/:tag`:
  - logged in → the asset page
  - logged out → the public report page
- [ ] RPCs `get_public_asset` and `submit_fault_report` (with the rate limit), plus the anon storage
  policy for `reports/`.
- [ ] **Public report page** (must work on a cheap Android phone and on mobile data):
  - shows tag, category, make and model only
  - fields: your name, what's wrong, optional photo
  - a thank-you screen with the FLT number
- [ ] Fault inbox:
  - "New from QR" badge
  - match `reported_by_name` to an employee in one click
- [ ] **Label printing page:**
  - choose tags, or "all assets without a printed label"
  - sets `label_printed_at`
  - see the label spec below

**Done when:**
- scanning a label with a logged-out phone files a report that appears in the inbox
- logged-out REST calls with the publishable key return nothing from any table or view

---

## Phase 4: Spare pool, reminders, repair vs replace

- [ ] Views `v_due_soon`, `v_asset_costs`, `v_stock_levels`, and the rest of `v_dashboard`.
- [ ] Settings page: edit the thresholds (repair %, repeat faults, reminder window, rate limit).
- [ ] **Dashboard panels:**
  - Due in the next 30 days: warranty and service, with overdue in red
  - Spare pool vs minimum
  - Stock to reorder
  - Open faults
  - Repair-vs-replace flags
- [ ] **Swap action** (`swap_asset`), on the asset page and in the fault inbox.
- [ ] **Reports page**, each report exportable:
  - repair-vs-replace list with the numbers
  - repair and service spend per department per month
  - faults by cause
  - service history by vendor
- [ ] **Leaver clearance print page:** everything the employee holds, including accessories, with
  signature lines for IT and HR.

**Done when:**
- an asset with repairs ≥ 50% of its replacement basis shows as flagged
- a category below its minimum spares turns red
- a warranty ending within 30 days shows on the dashboard

---

## Phase 5: Hardening and go-live

- [ ] `.github/workflows/keepalive.yml`:
  - every 3 days, call `ping()` with the publishable key
  - secrets `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`
- [ ] `.github/workflows/backup.yml`:
  - weekly `pg_dump` of PROD (secret `SUPABASE_DB_URL`)
  - encrypt with `gpg --symmetric` (secret `BACKUP_PASSPHRASE`)
  - upload as a workflow artifact with 90-day retention
  - photos are not included; say so in `docs/RESTORE.md`, together with the restore steps
- [ ] Audit log viewer (admin only).
- [ ] Loading, empty and error states on every page. Install-as-app tested on a Windows laptop
  (Chrome or Edge) and an Android phone.
- [ ] **Go-live:**
  - [ ] push the migrations to PROD
  - [ ] import the real workbook into PROD
  - [ ] create the boss and HR viewer accounts
  - [ ] switch the Cloudflare env vars to PROD
- [ ] `docs/USER_GUIDE.md`: one page for the boss and HR (log in, read the dashboard, print a
  clearance sheet).

**Done when:**
- PROD is live
- one backup has run and been restored into DEV successfully
- the boss and HR can log in and view

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
| **Fault Log** | Keep the FLT numbers. "fix by supplier (lanka pc)" → create vendor "Lanka PC", link it, and keep the text as `action_taken`. Cost 0, status Closed, date closed. Ask Sahan about `under_warranty` (open decision 3). |
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
   `get_public_asset`, `submit_fault_report` and `ping` can be called.
2. **Viewer:** can read everything. Every insert, update and delete fails, and every write RPC raises
   `not allowed`.
3. **Admin:** a direct update of `assets.status` or `assigned_employee_id` fails (guard trigger). The
   same change through the RPC works and writes a Change Log row.
4. **Logged in with no profile row:** sees nothing.
5. **Logged out:** `submit_fault_report` called more than the rate limit allows for one asset within
   an hour gets refused.

Automate this with an SQL test script (`supabase/tests/rls.sql`) or a small Vitest suite against
DEV, using test accounts and fake data.

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
