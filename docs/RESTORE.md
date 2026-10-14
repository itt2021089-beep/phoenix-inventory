# Backups and restoring

## What is backed up, and what is not

A GitHub Action (`.github/workflows/backup.yml`) backs up PROD every Monday at 02:00 Sri Lanka
time and keeps each one for **90 days**. Download it from the repo's **Actions** tab, open the
run, and take the `phoenix-backup` artifact (a zip holding one `.tar.gz.gpg` file).

| In the backup | Not in the backup |
|---|---|
| Every row of every table in `public`: assets, people (NIDs included), Change Log, faults, service, stock, settings, audit log, the lists | **Photos** and signed handover copies. They are files in Supabase Storage (bucket `photos`), not rows. If the project is lost, the photo *records* come back but the pictures do not. |
| Sequence positions, so the next CHG-, FLT-, HO-, SRV- number carries on | **User accounts and passwords.** They live in Supabase Auth. Make them again in the dashboard (step 5). |
| `profiles.csv`: who had which role (the list only) | |
| `schema.sql`: the table structure, for reference | |

The file is encrypted with the passphrase in the `BACKUP_PASSPHRASE` secret (AES-256). It contains
real staff data, so treat the decrypted file like the workbook. **Keep a copy of the passphrase
somewhere that is not this repo** (a password manager, or on paper in the safe): without it a
backup cannot be opened.

To back up photos as well, download the `photos` bucket from the Supabase dashboard (Storage) now
and then. There is no automatic photo backup, and the free plan has no point-in-time recovery, so
decide how much the photos matter.

## Taking a backup by hand

```bash
SUPABASE_DB_URL='postgresql://...' BACKUP_PASSPHRASE='...' scripts/backup.sh backups/
```

`SUPABASE_DB_URL` is the **Session pooler** connection string (Supabase dashboard -> Connect).
It needs `pg_dump` and `psql` version 17 or newer (the same as the server) and `gpg`. The script
checks that the dump finished and that the encrypted file can be read back before it says it is done.
Run the same command from the Actions tab with **Run workflow** to take one now.

## Restoring

A restore **replaces every row** in the public tables of the project you point it at. Practise on
**DEV first** (that is also how you prove the backup works). Never point it at PROD unless PROD is
what you are rebuilding.

1. **Get a database with the right structure.** For a test, DEV already has it. For a new project:
   create it, `npx supabase link --project-ref <ref>`, then `npx supabase db push`.
2. **Get the backup** and keep the passphrase to hand.
3. **Find the connection string** of the target (Session pooler) and its host name, the part after
   the `@` and before the next `:` or `/`.
4. **Run the restore:**
   ```bash
   RESTORE_DB_URL='postgresql://...target...' \
   CONFIRM_HOST='<the host name from that URL>' \
   BACKUP_PASSPHRASE='...' \
   scripts/restore-backup.sh phoenix-backup-2026-10-19.tar.gz.gpg
   ```
   `CONFIRM_HOST` must equal the host in the URL, so a pasted URL cannot hit the wrong project by
   accident. The script prints the row count of every table at the end; compare them with
   `MANIFEST.txt` inside the backup (`gpg -d file | tar -xzO MANIFEST.txt`).
5. **Give the accounts their roles.** The accounts are not in the backup. In the dashboard
   (Authentication -> Users -> Add user, auto-confirm) create each person, then, in the SQL
   editor, give them back their role and link them to their person (`profiles.csv` has the list):
   ```sql
   insert into public.profiles (id, full_name, role, employee_id)
   values ('<their user id from Authentication>', 'Full Name', 'admin', null)  -- or 'viewer'
   on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
   ```
6. **Check it:** open the app, check the dashboard counts, open an asset and its Change Log, issue
   nothing. The next change number should be one past the last one in the old system.
7. **Photos:** put the files back into the `photos` bucket under the same paths, if you saved them.

## What the restore does underneath (so it is not a mystery)

Triggers and foreign-key checks are switched off for the one session
(`session_replication_role = replica`), because the database's own rules rightly refuse to let
anyone write to assets, stock or the logs directly. Each public table is emptied except
`profiles`, the backup is loaded in one transaction (all or nothing), and every sequence is set
back. Afterwards the rules are back on: this was checked by restoring into an empty copy and
confirming that every table matched row for row, that the guard on asset status still refuses
direct edits, and that numbering carried on.

## When to do a test restore

- Once now, into DEV, before go-live (BUILD_PLAN: "one backup has run and been restored into DEV").
- After any change to the database structure, to make sure the restore still works.
- About twice a year, because a backup that has never been restored is a hope, not a backup.
