-- RLS checklist, Phase 0 scope (docs/BUILD_PLAN.md).
--
-- Run it against the DEV database as the `postgres` role:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
--
-- Everything happens in one transaction that is rolled back at the end, so it leaves no
-- rows behind. It uses fake users only. Never put real staff names or NIDs in here.
--
-- Covers checklist items 1, 2 and 4: profiles in detail, then every table, view, function and
-- sequence in public generically, so objects added in later phases are covered automatically.
-- Item 3 (the asset guard trigger) and the per-action viewer checks are in actions.sql; item 5
-- (the submit_fault_report rate limit) arrives in Phase 3.

begin;

do $$
declare
  admin_id   uuid := '11111111-1111-1111-1111-111111111111';
  viewer_id  uuid := '22222222-2222-2222-2222-222222222222';
  nobody_id  uuid := '33333333-3333-3333-3333-333333333333';
  visible    int;
  ok         boolean;
  failures   text[] := '{}';
begin
  -- Fake auth users.
  insert into auth.users (id, email)
  values (admin_id, 'admin@example.test'),
         (viewer_id, 'viewer@example.test'),
         (nobody_id, 'nobody@example.test')
  on conflict (id) do nothing;

  insert into public.profiles (id, full_name, role)
  values (admin_id, 'Test Admin', 'admin'),
         (viewer_id, 'Test Viewer', 'viewer')
  on conflict (id) do nothing;

  -- 1. Logged out: no access to the table or the helpers.
  begin
    set local role anon;
    perform 1 from public.profiles;
    failures := array_append(failures, 'anon could select from profiles');
  exception when insufficient_privilege then null;
  end;
  reset role;

  begin
    set local role anon;
    perform public.is_admin();
    failures := array_append(failures, 'anon could execute is_admin()');
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 4. Logged in with no profile row: sees nothing, is nobody.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', nobody_id::text, true);
  select count(*) into visible from public.profiles;
  if visible <> 0 then
    failures := array_append(failures, format('user with no profile saw %s profile rows', visible));
  end if;
  if public.is_viewer_or_admin() then
    failures := array_append(failures, 'is_viewer_or_admin() was true for a user with no profile');
  end if;
  if public.is_admin() then
    failures := array_append(failures, 'is_admin() was true for a user with no profile');
  end if;
  reset role;

  -- 2. Viewer: reads everything, writes nothing.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', viewer_id::text, true);
  select count(*) into visible from public.profiles;
  if visible < 2 then
    failures := array_append(failures, format('viewer saw only %s profile rows', visible));
  end if;
  if public.is_admin() then
    failures := array_append(failures, 'is_admin() was true for a viewer');
  end if;
  if not public.is_viewer_or_admin() then
    failures := array_append(failures, 'is_viewer_or_admin() was false for a viewer');
  end if;
  reset role;

  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', viewer_id::text, true);
    update public.profiles set role = 'admin' where id = viewer_id;
    failures := array_append(failures, 'viewer promoted themselves to admin');
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- Admin: reads everything and is recognised, but still cannot write this table.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  select count(*) into visible from public.profiles;
  if visible < 2 then
    failures := array_append(failures, format('admin saw only %s profile rows', visible));
  end if;
  if not public.is_admin() then
    failures := array_append(failures, 'is_admin() was false for an admin -- check that profiles is not FORCE row level security');
  end if;
  reset role;

  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', admin_id::text, true);
    insert into public.profiles (id, full_name, role)
    values ('44444444-4444-4444-4444-444444444444', 'Sneaky', 'admin');
    failures := array_append(failures, 'admin inserted a profile through the API');
  exception when insufficient_privilege then null;
  end;
  reset role;

  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', admin_id::text, true);
    delete from public.profiles where id = viewer_id;
    failures := array_append(failures, 'admin deleted a profile through the API');
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- ---------------------------------------------------------------------------
  -- Every table and view, present and future (checklist items 1 and 4).
  -- ---------------------------------------------------------------------------
  declare
    rel record;
    fn  record;
  begin
    for rel in
      select c.relname, c.relkind, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
    loop
      -- Tables: RLS on. Views: security_invoker, so the tables' RLS applies through them.
      if rel.relkind in ('r', 'p') and not rel.relrowsecurity then
        failures := array_append(failures, format('table %s has RLS off', rel.relname));
      end if;
      if rel.relkind = 'v' and not exists (
           select 1 from pg_class c, unnest(c.reloptions) o
           where c.relname = rel.relname and o in ('security_invoker=true', 'security_invoker=on')) then
        failures := array_append(failures, format('view %s is not security_invoker', rel.relname));
      end if;

      -- 1. anon has no privilege at all on it.
      if has_table_privilege('anon', format('public.%I', rel.relname), 'select,insert,update,delete') then
        failures := array_append(failures, format('anon has privileges on %s', rel.relname));
      end if;

      -- 4. a signed-in user with no profile reads nothing from it.
      set local role authenticated;
      perform set_config('request.jwt.claim.sub', nobody_id::text, true);
      begin
        execute format('select count(*) from public.%I', rel.relname) into visible;
        if visible <> 0 then
          failures := array_append(failures, format('user with no profile saw %s rows in %s', visible, rel.relname));
        end if;
      exception when insufficient_privilege then null;
      end;
      reset role;
    end loop;

    -- 1. anon may execute only the three public functions (none exist before Phase 3).
    for fn in
      select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname not in ('get_public_asset', 'submit_fault_report', 'ping')
    loop
      if has_function_privilege('anon', fn.oid, 'execute') then
        failures := array_append(failures, format('anon can execute %s()', fn.proname));
      end if;
    end loop;

    -- anon has no use of any sequence either.
    for rel in
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'S'
    loop
      if has_sequence_privilege('anon', format('public.%I', rel.relname), 'usage,select,update') then
        failures := array_append(failures, format('anon can use sequence %s', rel.relname));
      end if;
    end loop;
  end;

  if array_length(failures, 1) is null then
    raise notice 'RLS checklist: all checks passed (every table, view, function and sequence in public).';
  else
    raise exception E'RLS checklist FAILED:\n  - %', array_to_string(failures, E'\n  - ');
  end if;
end;
$$;

rollback;
