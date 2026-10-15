-- Tests for what a logged-out phone may do after scanning a QR label (Phase 3):
-- get_public_asset, submit_fault_report (inputs, rate limits, photo path) and ping, plus the
-- reports/ storage policy.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/public_report.sql
--
-- Needs Supabase's storage schema. One transaction, rolled back. Not for a database with real
-- data. Fake people only.

begin;

-- Newer Supabase storage refuses a direct delete from storage.objects unless this is on. The
-- test cleans up its fake files that way; it lasts only for this transaction, which is rolled back.
set local storage.allow_delete_query = 'true';

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  if p_user is null then set local role anon; else set local role authenticated; end if;
end $$;

create function pg_temp.expect_error(p_sql text, p_like text, p_label text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: % -- expected an error like "%", got none', p_label, p_like;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm not ilike p_like then
    raise exception 'FAIL: % -- expected an error like "%", got "%"', p_label, p_like, sqlerrm;
  end if;
end $$;

create function pg_temp.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_label; end if;
end $$;

grant execute on function pg_temp.act_as(uuid), pg_temp.expect_error(text, text, text),
  pg_temp.check(boolean, text) to anon, authenticated;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@example.test'),
  ('a0000000-0000-0000-0000-000000000002', 'viewer@example.test');
insert into public.profiles (id, full_name, role) values
  ('a0000000-0000-0000-0000-000000000001', 'Test Admin', 'admin'),
  ('a0000000-0000-0000-0000-000000000002', 'Test Viewer', 'viewer');

do $$
declare
  admin_id  uuid := 'a0000000-0000-0000-0000-000000000001';
  viewer_id uuid := 'a0000000-0000-0000-0000-000000000002';
  lap smallint := (select id from categories where tag_prefix = 'LAP');
  e1 uuid; l1 uuid; l2 uuid; l3 uuid;
  r record; n int; no text; pic text := 'reports/0b6c1f2e-3a4d-4e5f-8a9b-0c1d2e3f4a5b.jpg';
  long_text text := repeat('x', 1001);
begin
  perform pg_temp.act_as(admin_id);
  insert into employees (full_name, nid) values ('Test Person One', '200012345678') returning id into e1;
  perform add_assets(lap, 3, '{"make": "Dell", "model": "Latitude 5400"}');
  select id into l1 from assets where asset_tag = 'PBS-LAP-001';
  select id into l2 from assets where asset_tag = 'PBS-LAP-002';
  select id into l3 from assets where asset_tag = 'PBS-LAP-003';
  perform issue_assets(e1, jsonb_build_array(jsonb_build_object('asset_id', l1)));
  perform retire_asset(l3, 'Test: old');
  reset role;

  -- From here on, a logged-out phone.
  perform pg_temp.act_as(null);

  -- get_public_asset: tag, category, make, model; nothing for a retired or unknown tag.
  select * into r from get_public_asset('  pbs-lap-001 ');
  perform pg_temp.check(r.asset_tag = 'PBS-LAP-001' and r.category = 'Laptop' and r.make = 'Dell'
    and r.model = 'Latitude 5400', 'public asset: tag, category, make, model (tag tidied)');
  perform pg_temp.check((select count(*) from get_public_asset('PBS-LAP-003')) = 0, 'a retired asset is not shown');
  perform pg_temp.check((select count(*) from get_public_asset('PBS-NOPE-001')) = 0, 'an unknown tag shows nothing');
  perform pg_temp.check((select count(*) from get_public_asset(null)) = 0, 'a null tag shows nothing');
  perform pg_temp.check((select count(*) from get_public_asset(repeat('A', 5000))) = 0, 'a huge tag shows nothing');
  perform pg_temp.check(
    (select string_agg(column_name, ',') from (select unnest(proargnames) as column_name from pg_proc
     where proname = 'get_public_asset') x where column_name <> 'p_tag')
    = 'asset_tag,category,make,model', 'the public asset has exactly four columns, no names');

  perform pg_temp.check(ping() = 1, 'ping answers 1');

  -- submit_fault_report: inputs are checked, in plain words.
  perform pg_temp.expect_error($q$select submit_fault_report('PBS-LAP-001', '   ', 'Screen flickers')$q$,
    'Please enter your name%', 'a name is needed');
  perform pg_temp.expect_error(format($q$select submit_fault_report('PBS-LAP-001', %L, 'Screen flickers')$q$, repeat('N', 81)),
    'Please enter your name%', 'names over 80 characters are refused');
  perform pg_temp.expect_error($q$select submit_fault_report('PBS-LAP-001', 'Kamal', 'bad')$q$,
    'Please say what is wrong in 5 to 1000%', 'a description under 5 characters is refused');
  perform pg_temp.expect_error(format($q$select submit_fault_report('PBS-LAP-001', 'Kamal', %L)$q$, long_text),
    'Please say what is wrong in 5 to 1000%', 'a description over 1000 characters is refused');
  perform pg_temp.expect_error($q$select submit_fault_report('PBS-LAP-003', 'Kamal', 'Screen flickers')$q$,
    'This label is not recognised%', 'a retired asset cannot be reported');
  perform pg_temp.expect_error($q$select submit_fault_report('PBS-XYZ-999', 'Kamal', 'Screen flickers')$q$,
    'This label is not recognised%', 'an unknown tag cannot be reported');
  perform pg_temp.expect_error($q$select submit_fault_report(null, 'Kamal', 'Screen flickers')$q$,
    'This label is not recognised%', 'a missing tag cannot be reported');

  -- A good report: FLT number back, source qr, holder filled in, text tidied.
  no := submit_fault_report('pbs-lap-001', E'  Kamal\t  Perera ', E'Screen flickers\nafter lunch\u0007');
  perform pg_temp.check(no ~ '^FLT-[0-9]{4}$', 'a report returns its FLT number');
  reset role;
  select * into r from fault_log where fault_no = no;
  perform pg_temp.check(r.source = 'qr' and r.status = 'open', 'filed as an open QR report');
  perform pg_temp.check(r.reported_by_name = 'Kamal Perera' and r.reported_by_employee_id is null,
    'the typed name is kept, tidied, and not matched to anyone');
  perform pg_temp.check(r.description = E'Screen flickers\nafter lunch', 'line breaks kept, control characters gone');
  perform pg_temp.check(r.holder_employee_id = e1, 'the holder is filled in from the asset');
  perform pg_temp.check(r.created_by is null, 'nobody is logged in, so created_by is empty');
  perform pg_temp.check(exists (select 1 from audit_log where table_name = 'fault_log' and record_id = r.id::text),
    'the report is in the audit log');
  perform pg_temp.act_as(null);

  -- Photos: only a picture that really was uploaded to reports/, and only once.
  perform pg_temp.expect_error(format($q$select submit_fault_report('PBS-LAP-002', 'Kamal', 'Fan noise', %L)$q$, pic),
    'The photo did not upload%', 'a photo path that was never uploaded is refused');
  insert into storage.objects (bucket_id, name) values ('photos', pic);
  perform pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('photos', 'reports/not-a-uuid.jpg')$q$,
    '%row-level security%', 'anon uploads only reports/<uuid>.jpg');
  perform pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('photos', 'assets/x/0b6c1f2e-3a4d-4e5f-8a9b-0c1d2e3f4a5b.jpg')$q$,
    '%row-level security%', 'anon cannot upload outside reports/');
  perform pg_temp.check((select count(*) from storage.objects) = 0, 'anon cannot read or list the bucket, not even its own upload');
  update storage.objects set name = 'reports/x.jpg';
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'anon cannot rename or overwrite');
  delete from storage.objects;
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'anon cannot delete');
  perform pg_temp.expect_error($q$select submit_fault_report('PBS-LAP-002', 'Kamal', 'Fan noise', 'assets/../reports/x.jpg')$q$,
    'The photo did not upload%', 'a path outside reports/ is refused');
  no := submit_fault_report('PBS-LAP-002', 'Kamal', 'Fan noise', pic);
  reset role;
  perform pg_temp.check((select count(*) from photos p join fault_log f on f.id::text = p.entity_id
                         where f.fault_no = no and p.entity_type = 'fault' and p.kind = 'report' and p.storage_path = pic) = 1,
    'the photo is recorded against the report');
  perform pg_temp.act_as(null);
  perform pg_temp.expect_error(format($q$select submit_fault_report('PBS-LAP-002', 'Nimal', 'Fan noise again', %L)$q$, pic),
    'The photo did not upload%', 'the same photo cannot be attached twice');

  -- Rate limit per asset: 3 an hour (LAP-001 has 1 so far).
  perform submit_fault_report('PBS-LAP-001', 'Kamal', 'Screen flickers 2');
  perform submit_fault_report('PBS-LAP-001', 'Kamal', 'Screen flickers 3');
  perform pg_temp.expect_error($q$select submit_fault_report('PBS-LAP-001', 'Kamal', 'Screen flickers 4')$q$,
    'This item has already been reported several times%', 'a 4th report on one asset in an hour is refused');
  begin
    perform submit_fault_report('PBS-LAP-001', 'Kamal', 'Screen flickers 4');
  exception when others then
    perform pg_temp.check(sqlstate = 'PT429', 'a rate-limited report carries PT429, which PostgREST answers with HTTP 429');
  end;
  reset role;
  perform pg_temp.check((select count(*) from fault_log where source = 'qr' and asset_id = l1) = 3, 'so only 3 were filed');
  -- Faults Sahan enters himself do not count against the limit.
  perform pg_temp.act_as(admin_id);
  insert into fault_log (asset_id, description) values (l2, 'Entered by IT');
  reset role;
  -- An hour later the asset can be reported again.
  update fault_log set created_at = created_at - interval '61 minutes' where asset_id = l1;
  perform pg_temp.act_as(null);
  perform submit_fault_report('PBS-LAP-001', 'Kamal', 'Screen flickers again');
  reset role;

  -- The total cap across all assets: 20 an hour (setting), here lowered to 3 to test it.
  update settings set value = '3' where key = 'report_rate_limit_total';
  perform pg_temp.act_as(null);
  -- QR reports in the last hour now: LAP-002 x1, LAP-001 x1 = 2.
  perform submit_fault_report('PBS-LAP-002', 'Kamal', 'Keyboard sticky');
  perform pg_temp.expect_error($q$select submit_fault_report('PBS-LAP-002', 'Nimal', 'Battery dies fast')$q$,
    'Too many reports right now%', 'the total cap across assets holds');
  reset role;
  perform pg_temp.check((select (value #>> '{}')::int from settings where key = 'report_rate_limit') = 3
    and exists (select 1 from settings where key = 'report_rate_limit_total'), 'both limits are settings');
  -- A setting that is not a number cannot be saved any more (settings_validate); a missing one
  -- still falls back to 20.
  delete from settings where key = 'report_rate_limit_total';
  update fault_log set created_at = created_at - interval '2 hours';
  perform pg_temp.act_as(null);
  perform submit_fault_report('PBS-LAP-002', 'Kamal', 'A missing setting falls back to 20');
  reset role;

  -- Logged out: no table, view, sequence or other function (rls.sql covers the sweep).
  perform pg_temp.act_as(null);
  perform pg_temp.expect_error($q$select count(*) from fault_log$q$, '%permission denied%', 'anon reads no faults');
  perform pg_temp.expect_error($q$select count(*) from assets$q$, '%permission denied%', 'anon reads no assets');
  perform pg_temp.expect_error($q$select count(*) from photos$q$, '%permission denied%', 'anon reads no photo rows');
  perform pg_temp.expect_error($q$select is_admin()$q$, '%permission denied%', 'anon cannot call is_admin');
  perform pg_temp.expect_error($q$select _int_setting('report_rate_limit', 3)$q$, '%permission denied%', 'anon cannot call the helpers');
  perform pg_temp.expect_error($q$select _clean_tag('x')$q$, '%permission denied%', 'nor _clean_tag');
  reset role;

  -- Logged in: the lookup works, the report does not (it is for logged-out phones only).
  perform pg_temp.act_as(viewer_id);
  perform pg_temp.check((select count(*) from get_public_asset('PBS-LAP-001')) = 1, 'viewer can look up a tag');
  perform pg_temp.check((select count(*) from storage.objects where name = pic) = 1, 'viewer sees the report photo');
  perform pg_temp.expect_error($q$select submit_fault_report('PBS-LAP-002', 'Boss', 'Logged-in report')$q$,
    '%permission denied%', 'a viewer cannot file a report: viewers write nothing');
  reset role;
  perform pg_temp.act_as(admin_id);
  perform pg_temp.expect_error($q$select submit_fault_report('PBS-LAP-002', 'Sahan', 'Logged-in report')$q$,
    '%permission denied%', 'admin opens faults from the asset page, not this');
  reset role;

  -- Uploads to reports/ are capped per hour, like the reports themselves (audit M2). The
  -- setting was deleted above (testing the fallback), so it is put back at 2.
  insert into settings (key, value) values ('report_rate_limit_total', '2')
    on conflict (key) do update set value = excluded.value;
  delete from storage.objects;
  perform pg_temp.act_as(null);
  insert into storage.objects (bucket_id, name) values ('photos', 'reports/11111111-2222-4333-8444-555555555551.jpg');
  insert into storage.objects (bucket_id, name) values ('photos', 'reports/11111111-2222-4333-8444-555555555552.jpg');
  perform pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('photos', 'reports/11111111-2222-4333-8444-555555555553.jpg')$q$,
    '%row-level security%', 'the upload after the hourly cap is refused');
  reset role;
  perform pg_temp.check(not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'report_upload_allowed'),
    'the cap check is not in public, so the API does not publish it');

  raise notice 'Public report: all checks passed.';
end;
$$;

rollback;
