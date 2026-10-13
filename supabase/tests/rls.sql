-- RLS checklist, Phase 0 scope (docs/BUILD_PLAN.md).
--
-- Run it against the DEV database as the `postgres` role:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
--
-- Everything happens in one transaction that is rolled back at the end, so it leaves no
-- rows behind. It uses fake users only. Never put real staff names or NIDs in here.
--
-- Phase 0 covers checklist items 1, 2 and 4 for the only table that exists yet. Items 3
-- (the asset guard trigger) and 5 (the submit_fault_report rate limit) arrive with the
-- tables they belong to, in Phases 1 and 3.

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

  if array_length(failures, 1) is null then
    raise notice 'RLS checklist (Phase 0 scope): all checks passed.';
  else
    raise exception E'RLS checklist FAILED:\n  - %', array_to_string(failures, E'\n  - ');
  end if;
end;
$$;

rollback;
