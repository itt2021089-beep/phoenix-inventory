#!/usr/bin/env bash
# Backs up the PUBLIC data of a Supabase project into one encrypted file.
#
#   SUPABASE_DB_URL=postgresql://... BACKUP_PASSPHRASE=... scripts/backup.sh [out-dir]
#
# Writes <out-dir>/phoenix-backup-<YYYY-MM-DD>.tar.gz.gpg containing:
#   data.sql      every row of every table in `public` (not profiles), with sequence values
#   schema.sql    the structure, for reference (the migrations in git are the source of truth)
#   profiles.csv  who has which role (the accounts themselves live in Supabase Auth)
#   MANIFEST.txt  when, which database host, and a row count per table
# Photos are NOT included: they live in Supabase Storage. See docs/RESTORE.md.
#
# It contains real staff data (NIDs), so it is only ever written encrypted: the plain files live
# in a temporary folder that is removed when the script ends. Nothing here prints the database
# password or the passphrase.
set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL (the connection string of the project to back up)}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE (the password the backup is encrypted with)}"
out_dir="${1:-.}"
stamp="$(date -u +%Y-%m-%d)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$out_dir"

psql_() { psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -X -q "$@"; }
host="$(psql_ -tA -c "select coalesce(inet_server_addr()::text, 'local')")"

# Data: public tables only. profiles is left out because it points at auth.users, whose ids
# differ in another project; it goes into profiles.csv instead.
pg_dump "$SUPABASE_DB_URL" --data-only --schema=public --exclude-table=public.profiles \
  --no-owner --no-privileges --quote-all-identifiers -f "$work/data.sql"
pg_dump "$SUPABASE_DB_URL" --schema-only --schema=public --no-owner --no-privileges \
  -f "$work/schema.sql"
psql_ -c "\copy (select id, full_name, role, employee_id from public.profiles order by full_name) to '$work/profiles.csv' csv header"

{
  echo "Phoenix Inventory backup"
  echo "Taken (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Server: $host"
  echo "Postgres:    $(psql_ -tA -c 'show server_version')"
  echo
  echo "Rows per table:"
  psql_ -tA -F ' ' -c "
    select format('%-28s %s', c.relname,
             (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by c.relname"
} > "$work/MANIFEST.txt"

# A dump that did not finish has no end marker: refuse to ship half a backup.
tail -n 5 "$work/data.sql" | grep -q "PostgreSQL database dump complete" \
  || { echo "The data dump did not finish; not writing a backup." >&2; exit 1; }

tar -C "$work" -czf "$work/backup.tar.gz" data.sql schema.sql profiles.csv MANIFEST.txt
dest="$out_dir/phoenix-backup-$stamp.tar.gz.gpg"
gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" \
    --symmetric --cipher-algo AES256 -o "$dest" "$work/backup.tar.gz"

# Prove it can be opened again before calling it a backup.
# (Listed into a variable first: `grep -q` closing the pipe early would trip `pipefail`.)
listing="$(gpg --batch --quiet --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --decrypt "$dest" | tar -tz)"
printf '%s\n' "$listing" | grep -qx 'data.sql' \
  || { echo "The encrypted backup could not be read back." >&2; exit 1; }

echo "Wrote $dest ($(wc -c < "$dest") bytes)"
echo "--- manifest ---"
cat "$work/MANIFEST.txt"
