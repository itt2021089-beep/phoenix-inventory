# Go-live: the short version

The full reasons and screenshots-in-words are in `docs/GO_LIVE.md`. This page is only the order
and the commands, to run on **your own laptop** in the project folder (where `.env.local` and
`data/` live). Passwords, the database URL and the backup passphrase stay in your own environment:
never paste them into a chat.

## A. DEV first (nothing here touches PROD)
```bash
git checkout main && git pull
npm ci
npx supabase link --project-ref <DEV ref>
npx supabase db push          # one new migration: audit_log_admin_only
npm run gen:types             # should change nothing
npm run lint && npm test && npm run build
npm run test:rls              # must pass all
npm run smoke                 # must end "All clear"
```
Then in the DEV app: set each category's typical replacement cost and minimum spares (Settings),
and try the **Audit log** page.

## B. PROD (only when you are ready; it cannot be undone)
1. Supabase dashboard (PROD): turn **sign-ups off**; note URL, publishable key and the
   **Session pooler** connection string.
2. Push the schema:
   ```bash
   npx supabase link --project-ref <PROD ref>
   npx supabase db push
   npx supabase link --project-ref <DEV ref>    # link back to DEV straight away
   ```
3. Dashboard -> Authentication -> Users: add Sahan, the boss and HR (auto-confirm). Then, in the
   PROD SQL editor, insert their `profiles` rows (SQL in `docs/GO_LIVE.md`, step 3).
4. Cloudflare Pages -> Production variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
   `VITE_PUBLIC_APP_URL` (the live address). Redeploy.
5. Sign in on the live site -> **Import** -> the real workbook -> read the preview -> confirm.
6. GitHub -> Settings -> Secrets -> Actions: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`. Run **Keep Supabase awake** and **Weekly backup**
   once from the Actions tab. Download the backup artifact.
7. Restore that backup into **DEV** (`docs/RESTORE.md`) and compare the row counts.
8. Check PROD from outside:
   ```bash
   SMOKE_URL=<PROD url> SMOKE_KEY=<PROD publishable key> npm run smoke    # "All clear"
   ```

## C. By hand, on real things
- [ ] Boss and HR can sign in and see everything but have no Add / Edit buttons.
- [ ] Print labels, stick one on a laptop, scan it from a phone that is not signed in, and send a
      test report with a photo.
- [ ] Install the app on a Windows laptop (Chrome or Edge) and an Android phone.
- [ ] Look at the response headers of the live site (browser Network tab) for
      `Content-Security-Policy`.
- [ ] Hand `docs/USER_GUIDE.md` to the boss and HR. Write down the first backup date and where the
      passphrase is kept.

## To continue this with Claude on the laptop
Open the project folder in the Claude Desktop app (or run `claude remote-control` in a terminal
there) and paste:

> Read docs/GO_LIVE_QUICK.md. Do section A for me and tell me the results. Stop before section B
> and ask me. For B, run only the commands that touch PROD after I say go for each step, and never
> print passwords, the database URL or the passphrase.
