# Phoenix Inventory

IT and asset inventory for Phoenix BPO Solutions: who has which laptop, headset and other
equipment, faults and repairs, service jobs, stock of mice and chargers, handover forms and
QR labels. It replaces the Excel workbook and the paper handover form.

- **Live:** https://phoenix-inventory.pages.dev
- **Who uses it:** Sahan (IT, the only person who changes data), the boss and HR (view and print),
  and staff, who scan an item's QR label to report a fault (no login).

## Where to read next

| You want to | Read |
|---|---|
| Use the app as the boss or HR | [docs/USER_GUIDE.md](docs/USER_GUIDE.md) |
| Put it live, or check it is set up right | [docs/GO_LIVE.md](docs/GO_LIVE.md) |
| Back up or restore the data | [docs/RESTORE.md](docs/RESTORE.md) |
| See the data model and the database rules | [docs/SCHEMA.md](docs/SCHEMA.md) |
| See what was built, and what is open | [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) |
| See the latest audit and its fixes | [docs/AUDIT.md](docs/AUDIT.md) |
| Work on the code (rules, vocabulary, commands) | [CLAUDE.md](CLAUDE.md) |

## Run it on this computer

```bash
npm ci
npm run dev
```

`npm run dev` needs `.env.local` (copy `.env.example`; DEV's URL and publishable key only).
Before committing: `npm run lint && npm test && npm run build`.

**Stack:** Vite, React and TypeScript on Cloudflare Pages; Supabase (Postgres, Auth, Storage)
with the business rules in SQL. Merging to `main` deploys the site at once, but database
migrations are pushed by hand: push them to PROD **before** merging (see the pull request
checklist).

Real staff data (the workbook, exports, backups) must stay out of git; see `CLAUDE.md`. One copy of
the original workbook is still tracked: see finding H3 in [docs/AUDIT.md](docs/AUDIT.md).
