# Phoenix Inventory

IT and asset inventory web app for Phoenix BPO Solutions (about 30 staff, Sri Lanka). It replaces
the Excel workbook `IT_Asset_Inventory_Phoenix_BPO.xlsx` and the paper IT Equipment Handover Form.

- Sahan (IT admin) is the only person who edits data.
- The boss and HR can view everything but change nothing.
- Staff have no login. They scan the QR label on an item to report a fault.

Read `docs/SCHEMA.md` before any database work. Read `docs/BUILD_PLAN.md` before starting or
finishing a phase, and tick off finished tasks there.

## The goal: less typing than Excel

Sahan built this app because filling in the Excel sheet by hand was exhausting. Every screen should
remove keystrokes:
- pick from lists
- default sensibly (today's date, the employee's desk, the last known condition)
- offer bulk actions and "duplicate this item"
- use QR links instead of typed tags

If a feature adds typing without saving more elsewhere, raise it before building it.

## Stack (ask before changing any of it)

- **Frontend:** Vite + React + TypeScript, React Router, TanStack Query, react-hook-form + zod,
  Tailwind CSS + shadcn/ui. Installable PWA via `vite-plugin-pwa`, so it can be installed on a
  laptop like a desktop app.
- **Backend:** Supabase (Postgres, Auth, Storage) and no custom server. Business rules live in SQL:
  RLS policies, triggers and RPC functions.
- **Libraries:**
  - `@supabase/supabase-js` v2
  - `exceljs` for import/export, lazy-loaded on those pages only
  - `qrcode` for labels
  - `browser-image-compression` for photos
- **Hosting:** Cloudflare Pages (free), auto-deployed from GitHub `main`. The SPA fallback lives in
  `public/_redirects`: `/*  /index.html  200`.
- **Environments:** two Supabase free projects, `phoenix-inventory-dev` and `phoenix-inventory-prod`.
- **Budget is zero.** Never add a paid service, or anything that needs a credit card.

## Commands (available once Phase 0 is done)

```bash
npm run dev      # local app at http://localhost:5173, using the DEV Supabase project
npm run build    # production build into dist/
npm run lint
npm test         # Vitest

npx supabase link --project-ref <ref>      # once per project
npx supabase migration new <name>          # creates supabase/migrations/<timestamp>_<name>.sql
npx supabase db push                       # apply new migrations to the linked project
npx supabase gen types typescript --linked > src/lib/database.types.ts
```

- `.env.local` (gitignored) holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and
  `VITE_PUBLIC_APP_URL` (the deployed URL, used inside QR codes).
- `.env.example` is committed with the names only, no values.
- Only push migrations to the PROD project when Sahan says so.

## Users and roles

| Role | Who | Can |
|---|---|---|
| `admin` | Sahan | Everything |
| `viewer` | Boss, HR | Read everything (NIDs included), print reports and leaver clearance sheets. No writes. |
| (no login) | Staff | Open `/a/<asset_tag>` from a QR label and submit a fault report. Read nothing. |

- **Accounts:** created by hand in the Supabase dashboard (Authentication → Users → Add user,
  auto-confirm). A `profiles` row then sets the role. Public sign-ups are disabled.
- **No email flows** (password reset, magic links, invites). Supabase's default email sender only
  reaches project team members and is capped at 2 emails an hour. Sahan resets passwords in the
  dashboard.
- **No profile, no access:** a logged-in user without a `profiles` row sees an "ask IT for access"
  screen and nothing else.

## Vocabulary (keep the words Sahan already uses in Excel)

- **Asset tag:** `PBS-<PREFIX>-<NNN>`, for example `PBS-LAP-001`. Each category has a
  3-uppercase-letter prefix. Numbers are never reused.
- **Asset status:** In Use, Spare, Under Repair, Faulty, Lost / Stolen, Retired, Disposed.
  Spare means "ready to issue", which is the spare pool. "Active" means not Retired or Disposed.
- **Condition:** New, Good, Fair, Poor, Damaged.
- **Change Log types:** Received (New), Issued, Returned, Reassigned, Location Changed,
  Sent for Repair, Back from Repair, Upgraded, Part Replaced, OS Reinstalled, Retired, Disposed.
- **Fault status:** Open, In Progress, With Vendor, Closed.
- **Departments:** only HR, Sales, Retention, Travel, IT. Shared areas such as the CEO room have no
  department and show as "Common".
- **Display numbers:** `CHG-0001` (change log), `FLT-0001` (fault), `HO-0001` (handover form),
  `SRV-0001` (service job), `CON-001` (consumable).
- **Codes vs labels:** the database stores codes (`in_use`, `lost_stolen`, ...). They map to the
  labels above in one place, `src/lib/constants.ts`. Excel import and export use the labels.
- **NID:** staff are identified by their National ID (NIC) number. There are no employee IDs.

## Domain rules

1. **Mice and keyboards are not assets.** They're accessories ticked when a laptop or desktop is
   issued ("gave a mouse with the laptop").
   - The accessory types are Charger, Mouse, Mouse pad, Bag and Keyboard, and Sahan can edit the
     list.
   - An accessory type can be linked to a consumable stock item. Ticking it at issue deducts 1 from
     stock, and ticking it as returned adds 1 back.
2. **Tagged assets:** headsets, laptops, desktops, monitors, network gear, AC units and the like
   each get their own row and tag.
3. **Department and location are separate.**
   - Department is who the asset serves (null means Common).
   - Location is where it physically sits (a room, desk or store).
   - An asset can also be assigned to a person.
4. **Never delete.**
   - Assets become Retired or Disposed.
   - Employees are marked Left.
   - Logs are permanent: a mistake is fixed with a correcting entry, not an edit.
   - The UI has no delete button for any of these.
5. **The Change Log and the asset can never disagree.**
   - Every movement of an asset writes a Change Log row.
   - Each action (issue, return, transfer, swap, move, repair, retire, dispose) is one SQL function
     that runs in a transaction.
   - The frontend never updates `assets.status`, `assigned_employee_id`, `location_id` or
     `department_id` directly, and a guard trigger enforces this.
6. **Work on existing assets is a service job, not a new asset type.**
   - Example: "cleaned and repaired the HR room, CEO room and Sales room ACs", with date, vendor and
     price. That is ONE service job with one line per AC.
   - Each line can set the next due date.
7. **Record each cost in exactly one place.**
   - If a fault is fixed on its own, the cost goes on the fault.
   - If it's fixed as part of a service job, the cost goes on the service line; the fault links to
     that line and keeps cost 0.
8. **"Who broke it" is three separate facts:**
   - `reported_by`: who told us.
   - The holder at the time: filled in automatically from the asset's current assignee.
   - `responsible_employee_id` + `cause`: Sahan's finding after checking. Only admin writes findings.
9. **Spare pool:** each category has a `min_spares` value. The dashboard warns when the Spare count
   for that category is below it.
10. **Repair vs replace:** flag an asset when either is true (both thresholds live in `settings`):
    - total repair spend ≥ 50% of its replacement basis, which is the purchase price, or else the
      category's typical replacement cost
    - it had 3 or more faults in the last 12 months
11. **Reminders:** warranties ending and services due within 30 days (a setting), or overdue, appear
    on the dashboard.
12. **Handover form:** issue, return and transfer can produce the printable company handover form
    (layout in `docs/BUILD_PLAN.md`). Its `HO-` number is stored on the related Change Log rows, so
    nobody has to copy it across by hand.

## Security and privacy (non-negotiable)

- **RLS** is enabled on every table and denies by default. Policies use the SQL helpers
  `is_admin()` and `is_viewer_or_admin()`.
- **Views** are created `with (security_invoker = true)` so RLS still applies through them.
- **Write RPCs** are `security definer` with `set search_path = public`, and they check `is_admin()`
  first.
  - The only exceptions are `get_public_asset`, `submit_fault_report` and `ping`.
  - Those three validate every input, and `submit_fault_report` is rate-limited.
- **Keys:**
  - The frontend only ever gets `VITE_SUPABASE_URL` and the publishable key (called the anon key in
    older projects).
  - The secret key (service_role) never goes in frontend code, the repo or a chat.
  - Nothing in this app needs the secret key.
- **NIDs:**
  - Shown only to admin and viewers.
  - Never in URLs, QR codes, console logs, error messages or the public report page.
  - The public report page shows only tag, category, make and model, plus no employee names at all.
- **Real data:**
  - `data/` (the real workbook, exports, backups) and every `*.xlsx` are gitignored.
  - Never commit real staff data. Tests use fake names and NIDs.
- **Photos:**
  - They go to the private bucket `photos`.
  - They're compressed in the browser (longest side 1600 px, about 200 KB).
  - They're shown through short-lived signed URLs.

## Conventions

- **Database:**
  - snake_case names and plural table names
  - `created_at` / `created_by` / `updated_at` on main tables
  - `numeric(12,2)` for money (LKR) and `date` for business dates
- **Migrations:**
  - Schema changes happen only as new files in `supabase/migrations/`. Never edit a migration that
    has already been applied.
  - Regenerate `src/lib/database.types.ts` after each one.
  - Update `docs/SCHEMA.md` in the same commit.
- **Display:**
  - Dates as DD/MM/YYYY, timezone Asia/Colombo.
  - Money as `LKR 12,500`.
- **UI:**
  - Plain English and the Excel terms.
  - Phone-first for the asset page, issue/return, photos and the public report form.
  - Desktop-friendly tables everywhere else.
  - Every list has search, filters and an export.
- **Code layout:**
  - Features: `src/features/<area>/` (assets, issue, faults, service, stock, people, reports,
    settings, import-export, print, public-report).
  - Shared UI: `src/components/`. Helpers: `src/lib/`.
- **Printing:**
  - Dedicated A4 print routes under `/print/...` with print CSS.
  - The browser's Print → Save as PDF produces PDFs. Don't add a PDF library.

## How to work in this repo

- Work one phase at a time from `docs/BUILD_PLAN.md`. Start each phase by presenting a plan, and wait
  for Sahan's OK before writing code.
- Work in small steps. After each working step, run `npm run lint && npm test && npm run build` and
  commit with a clear message.
- After any SQL or RLS change, run the RLS checklist in `docs/BUILD_PLAN.md`.
- Ask before:
  - adding a dependency that isn't in the stack above
  - changing the schema in a way `docs/SCHEMA.md` doesn't describe
  - anything that deletes data
  - touching the PROD project
- Never delete or overwrite `CLAUDE.md`, `docs/` or `data/`. That includes scaffolding a Vite app
  into this folder: choose "Ignore files and continue", or scaffold elsewhere and move the files in.

## Open decisions (ask Sahan when you reach them)

1. **Keyboards:** accessory (the current assumption) or tagged asset?
2. **HR access:** strictly view-only, or allowed to add joiners and mark leavers?
3. **FLT-0001** (Lanka PC, cost 0): was it under warranty?
4. **Per-category numbers:**
   - typical replacement cost and minimum spares for each category
   - the AC service interval (90 days is a placeholder)
5. **AC units:** which rooms have them, and which vendor did the recent cleaning and repair job.
