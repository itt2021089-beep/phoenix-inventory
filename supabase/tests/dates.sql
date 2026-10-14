-- Business dates the database fills in itself are the Sri Lanka date (migration colombo_dates).
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/dates.sql
--
-- The bug only showed between midnight and 05:30 in Colombo, when the UTC date is still
-- yesterday. So the session is put in a time zone whose date is different from Colombo's right
-- now (UTC-12 or UTC+14: at any moment one of the two is), and every date the database picks
-- must still be Colombo's. One transaction, rolled back. Fake people only. Like the other
-- suites, never run it against PROD: it uses up CHG/FLT/HO numbers even though it rolls back.

begin;

set local storage.allow_delete_query = 'true';

select set_config('timezone',
  case when (now() at time zone 'Etc/GMT+12')::date <> (now() at time zone 'Asia/Colombo')::date
       then 'Etc/GMT+12' else 'Etc/GMT-14' end, true);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  if p_user is null then set local role anon; else set local role authenticated; end if;
end $$;

create function pg_temp.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_label; end if;
end $$;

grant execute on function pg_temp.act_as(uuid), pg_temp.check(boolean, text) to anon, authenticated;

insert into auth.users (id, email) values ('d0000000-0000-0000-0000-000000000001', 'admin@example.test');
insert into public.profiles (id, full_name, role)
values ('d0000000-0000-0000-0000-000000000001', 'Test Admin', 'admin');

do $$
declare
  admin_id uuid := 'd0000000-0000-0000-0000-000000000001';
  today    date := (now() at time zone 'Asia/Colombo')::date;
  lap smallint := (select id from categories where tag_prefix = 'LAP');
  e1 uuid; l1 uuid; l2 uuid; tags text[]; no text; f_id bigint; job text; stock bigint;
begin
  perform pg_temp.check(current_date <> today, 'the test session''s own date differs from Colombo''s');

  -- Structure: nothing is left that falls back to the session's date.
  perform pg_temp.check(not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and column_default ilike '%current_date%'),
    'no column in public defaults to current_date');
  perform pg_temp.check(not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosrc ~* 'current_date'
        and not coalesce(array_to_string(p.proconfig, ',') ilike '%timezone=Asia/Colombo%', false)),
    'every function in public that uses current_date runs with timezone Asia/Colombo '
    || '(create or replace drops the setting: repeat set timezone = ''Asia/Colombo'')');

  -- Behaviour, as the admin, with no dates passed in.
  perform pg_temp.act_as(admin_id);
  insert into employees (full_name, nid) values ('Test Dates Person', '199900000017') returning id into e1;
  tags := add_assets(lap, 2, '{"make": "Dell"}');
  select id into l1 from assets where asset_tag = tags[1];
  select id into l2 from assets where asset_tag = tags[2];
  perform pg_temp.check((select change_date from change_log where asset_id = l1 and change_type = 'received_new') = today,
    'add_assets: the Received (New) row is dated today in Colombo');

  no := issue_assets(e1, jsonb_build_array(jsonb_build_object('asset_id', l1)), null, null, null, true);
  perform pg_temp.check((select date_assigned from assets where id = l1) = today, 'issue: date assigned is today in Colombo');
  perform pg_temp.check((select change_date from change_log where asset_id = l1 and change_type = 'issued') = today,
    'issue: the Issued row is dated today in Colombo');
  perform pg_temp.check((select form_date from handover_forms where form_no = no) = today,
    'issue: the handover form is dated today in Colombo');

  insert into fault_log (asset_id, description) values (l1, 'Test: keyboard sticks') returning id into f_id;
  perform pg_temp.check((select date_reported from fault_log where id = f_id) = today,
    'a fault logged without a date is reported today in Colombo');
  update fault_log set status = 'closed' where id = f_id;
  perform pg_temp.check((select date_closed from fault_log where id = f_id) = today,
    'a fault closed without a date is closed today in Colombo');

  job := record_service_job(
    jsonb_build_object('job_type', 'cleaning'),
    jsonb_build_array(jsonb_build_object('asset_id', l2, 'work_done', 'Cleaned', 'cost', 0)));
  perform pg_temp.check((select service_date from service_jobs where job_no = job) = today,
    'a service job without a date is dated today in Colombo');

  stock := (select id from stock_items order by id limit 1);
  if stock is not null then
    insert into stock_movements (stock_item_id, movement_type, qty_change) values (stock, 'received', 1);
    perform pg_temp.check((select movement_date from stock_movements where stock_item_id = stock order by id desc limit 1) = today,
      'a stock movement without a date is dated today in Colombo');
  end if;
  reset role;

  -- The case that was seen: a logged-out phone's QR report.
  perform pg_temp.act_as(null);
  no := submit_fault_report(tags[1], 'Test Reporter', 'Screen flickers when opened');
  reset role;
  perform pg_temp.check((select date_reported from fault_log where fault_no = no) = today,
    'a QR report is dated today in Colombo');
  perform pg_temp.check((select age_days from v_open_faults where fault_no = no) = 0,
    'a QR report made just now is 0 days old on the dashboard');

  raise notice 'Dates: all checks passed (session date %, Colombo date %).', current_date, today;
end $$;

rollback;
