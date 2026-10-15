# Go-live checklist (PROD)

Everything here touches the **PROD** project, so it is yours to run, in this order. Nothing in the
app or the repo does it for you. Tick each box as you go. If anything fails, stop; nothing here
needs to be rushed.

You will need: the PROD project (`phoenix-inventory-prod`), its **Session pooler** connection
string, the GitHub repo's Settings access, the Cloudflare Pages project, and the real workbook.

## 0. Before you start (DEV)
- [ ] `npm run lint && npm test && npm run build` pass on `main`.
- [ ] `npm run test:rls` passes on DEV (all of it).
- [ ] In DEV: set each category's **minimum spares** (Settings -> Categories). Decide the real AC service interval (default 90 days) and write it in too.
- [ ] A test restore has worked into DEV (docs/RESTORE.md, "Restoring"). If this is your first backup, run the **Weekly backup** workflow once from the Actions tab (step 6 sets its secrets first) and restore that file into DEV.

## 1. PROD project settings (Supabase dashboard)
- [ ] Authentication -> Sign In / Providers -> **turn "Allow new users to sign up" OFF** (public sign-ups are disabled).
- [ ] Authentication -> **turn "Confirm email" OFF** only if you use auto-confirm for hand-made users (as in DEV), otherwise leave it.
- [ ] Project Settings -> API: note the **URL** and the **publishable key**. Do not copy the secret key anywhere.
- [ ] Project Settings -> Database: note the **Session pooler** connection string (for the backup, step 6). Keep the database password somewhere safe.

## 2. Push the migrations to PROD
```bash
npx supabase link --project-ref <PROD project ref>
npx supabase db push          # applies every file in supabase/migrations/
npx supabase link --project-ref <DEV project ref>   # link back to DEV straight away
```
- [ ] It lists the migrations and applies them with no error. (You can also run `npm run gen:types` afterwards; it should change nothing.)
- [ ] If PROD already has data: migration `department_follows_person` also gives every held item its holder's department (one Department Changed row each), which fixes items showing Common.

## 3. Create the accounts (Supabase dashboard -> Authentication -> Users -> Add user, auto-confirm)
Make three people, with strong passwords you give them in person (there is no password email):
- [ ] **Sahan** (admin), **the boss** (viewer), **HR** (viewer).

Then give each one a role (SQL editor in PROD), using the user id shown in the Users list:
```sql
insert into public.profiles (id, full_name, role) values
  ('<Sahan user id>', 'Sahan Samidhu', 'admin'),
  ('<boss user id>',  '<Boss name>',   'viewer'),
  ('<HR user id>',    '<HR name>',     'viewer');
```
- [ ] A user with no row in `profiles` sees only "Ask IT for access". That is correct until you do this.

## 4. Point the app at PROD (Cloudflare Pages -> the project -> Settings -> Variables and Secrets)
- [ ] For the **Production** environment set `VITE_SUPABASE_URL` (PROD URL), `VITE_SUPABASE_PUBLISHABLE_KEY` (PROD publishable key) and `VITE_PUBLIC_APP_URL` (the live address, **not** DEV or localhost: it goes inside every QR label).
- [ ] Redeploy (Deployments -> Retry, or push to `main`). Open the live address and sign in as Sahan: the dashboard loads, empty.
- [ ] Keep DEV's values only on the Preview environment, so a preview never touches real data.

## 5. Import the real workbook
- [ ] Sign in as Sahan on the **live** site and type `/import` after the address (it is not in the menu any more; it is kept only for this step). Choose `IT_Asset_Inventory_Phoenix_BPO.xlsx`, read the preview and its warnings, then confirm.
- [ ] Check: asset count, a few people (NIDs present), FLT-0001 and the mouse stock (8) match what DEV showed.
- [ ] Re-importing the same file changes nothing, so it is safe to repeat after fixing something in Excel.
- [ ] Once PROD's data is right, ask for the Import page and its code to be deleted (the route in `src/App.tsx` says so).

## 6. Keep-alive and backup (GitHub -> repo Settings -> Secrets and variables -> Actions)
- [ ] Secrets: `SUPABASE_URL` (PROD), `SUPABASE_PUBLISHABLE_KEY` (PROD), `SUPABASE_DB_URL` (PROD **Session pooler** string), `BACKUP_PASSPHRASE` (a long passphrase; **keep a copy outside GitHub**).
- [ ] Actions tab -> **Keep Supabase awake** -> Run workflow: it must finish green.
- [ ] Actions tab -> **Weekly backup** -> Run workflow: it must finish green and leave a `phoenix-backup` artifact. Download it.
- [ ] **Restore that backup into DEV** (docs/RESTORE.md). Compare the row counts it prints with the manifest.

## 7. Check PROD from outside (read-only)
With `.env.local` pointing at PROD (or `SMOKE_URL` / `SMOKE_KEY` set on one line):
```bash
npm run smoke
```
- [ ] It must end with **"All clear"**. It looks at the project as a stranger and fails if any table, function, photo or sign-up is open. (It only reads, and every write it tries must be refused.)
- [ ] Sign in as the boss and as HR on the live site: they see everything, and there are no Add / Edit / Issue buttons.
- [ ] Open `/import` as the boss: "Only IT can do this". Open it as Sahan: it works.

## 8. Labels and the first real scan
- [ ] Print labels (**Assets -> Print QR labels**). The QR must open `<live address>/a/<tag>`.
- [ ] Stick one on a laptop. Scan it from a phone that is **not** signed in: the report page opens fast, shows only the tag and model, and a test report with a photo arrives in the Faults inbox as "New from QR".
- [ ] Install the app: on a Windows laptop (Chrome or Edge: the install icon in the address bar) and on an Android phone ("Add to Home screen"). It should open in its own window.

## 9. Hand over
- [ ] Give the boss and HR `docs/USER_GUIDE.md`.
- [ ] Note the dates: the first backup, the first restore test, the passphrase location.
- [ ] Every few months: run **npm run smoke**, run a test restore, and check the Actions tab is green.

## If something goes wrong
- The wrong data went into PROD: restore the last backup (docs/RESTORE.md), or, if it was only the workbook import, fix the workbook and import again.
- You cannot sign in: check the account exists and has a `profiles` row; passwords are reset in the dashboard (Authentication -> Users).
- A page shows "Could not reach the server": check the internet first, then `VITE_SUPABASE_URL` in Cloudflare, then the Supabase project status (it is paused if nothing called it for a week: the keep-alive prevents that).
