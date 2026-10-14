#!/usr/bin/env bash
# Restores a backup made by scripts/backup.sh into a Supabase project that already has the
# migrations applied (`npx supabase db push`). It REPLACES every row in the public tables.
#
#   RESTORE_DB_URL=postgresql://... BACKUP_PASSPHRASE=... CONFIRM_HOST=<host in the URL> \
#     scripts/restore-backup.sh phoenix-backup-2026-10-18.tar.gz.gpg
#
# Safety: CONFIRM_HOST must equal the host in RESTORE_DB_URL, so a pasted URL cannot be aimed at
# the wrong project by accident. Use DEV for a test restore; never PROD unless PROD is the thing
# being rebuilt.
#
# How it loads: triggers and foreign keys are switched off for the session
# (session_replication_role = replica), because the guard triggers rightly refuse direct writes
# to assets and stock and the logs are append-only. Rows are deleted table by table, then the
# backup is loaded, which also puts every sequence back where it was. User accounts and their
# roles are left alone (see profiles below).
set -euo pipefail

backup="${1:?Give the backup file (phoenix-backup-....tar.gz.gpg)}"
: "${RESTORE_DB_URL:?Set RESTORE_DB_URL (the project to restore INTO)}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}"
: "${CONFIRM_HOST:?Set CONFIRM_HOST to the host name in RESTORE_DB_URL, to confirm the target}"

url_host="$(printf '%s' "$RESTORE_DB_URL" | sed -E 's#^[a-z]+://([^@]*@)?([^:/?]+).*#\2#')"
if [ "$url_host" != "$CONFIRM_HOST" ]; then
  echo "CONFIRM_HOST ($CONFIRM_HOST) is not the host in RESTORE_DB_URL ($url_host). Nothing was changed." >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
gpg --batch --quiet --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --decrypt \
    -o "$work/backup.tar.gz" "$backup" 2>/dev/null \
  || { echo "Could not open the backup: is BACKUP_PASSPHRASE the one it was made with? Nothing was changed." >&2; exit 1; }
tar -xzf "$work/backup.tar.gz" -C "$work"
echo "Backup contents:"; sed -n '1,4p' "$work/MANIFEST.txt"

psql_() { psql "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -X -q "$@"; }

# The target must already have the schema.
psql_ -tA -c "select 1 from information_schema.tables where table_schema='public' and table_name='assets'" \
  | grep -q 1 || { echo "The target has no tables. Run 'npx supabase db push' first." >&2; exit 1; }

echo "Restoring into $url_host ..."
{
  echo "begin;"
  echo "set session_replication_role = replica;"
  cat <<'SQL'
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'profiles'
  loop
    execute format('delete from public.%I', t);
  end loop;
end $$;
SQL
  cat "$work/data.sql"
  cat <<'SQL'
-- Accounts are not restored (they live in Auth), but a profile that pointed at a person who
-- is no longer there would dangle.
update public.profiles set employee_id = null
 where employee_id is not null and employee_id not in (select id from public.employees);
commit;
SQL
} | psql "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -X -q -o /dev/null

echo "Restored. Row counts now:"
psql_ -tA -F ' ' -c "
  select format('%-28s %s', c.relname,
           (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' order by c.relname"
echo
echo "Roles: profiles.csv in the backup lists who had which role. Accounts are made in the Supabase"
echo "dashboard; see docs/RESTORE.md step 5 to give each one back its role."
