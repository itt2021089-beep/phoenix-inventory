-- Behaviour tests for faults, service jobs and repairs (Phase 2).
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/faults_service.sql
--
-- One transaction, rolled back at the end. Not for a database with real data. Fake people only.

begin;

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
  acu smallint := (select id from categories where tag_prefix = 'ACU');
  store smallint := (select id from locations where name = 'IT store');
  e1 uuid;
  vendor bigint;
  l1 uuid; l2 uuid; ac1 uuid; ac2 uuid;
  f1 bigint; f2 bigint; f3 bigint;
  job text; r record;
begin
  perform pg_temp.act_as(admin_id);

  insert into employees (full_name, nid) values ('Test Person One', '200012345678') returning id into e1;
  insert into vendors (name) values ('Test Vendor') returning id into vendor;
  perform add_assets(lap, 2, '{}');
  perform add_assets(acu, 2, '{}');
  select id into l1 from assets where asset_tag = 'PBS-LAP-001';
  select id into l2 from assets where asset_tag = 'PBS-LAP-002';
  select id into ac1 from assets where asset_tag = 'PBS-ACU-001';
  select id into ac2 from assets where asset_tag = 'PBS-ACU-002';

  -- A fault reported directly: FLT number, holder filled from the asset.
  perform issue_assets(e1, jsonb_build_array(jsonb_build_object('asset_id', l1)));
  insert into fault_log (asset_id, description, reported_by_name) values (l1, 'Keyboard keys stick', 'Front desk')
  returning id into f1;
  select * into r from fault_log where id = f1;
  perform pg_temp.check(r.fault_no ~ '^FLT-[0-9]{4}$', 'fault gets an FLT number');
  perform pg_temp.check(r.holder_employee_id = e1, 'holder filled in from the asset');
  perform pg_temp.check(r.status = 'open' and r.cost = 0 and r.under_warranty = false, 'fault defaults');
  perform pg_temp.expect_error(format($q$insert into fault_log (asset_id, description) values (%L, '  ')$q$, l1),
    '%fault_log_description_check%', 'a fault needs a description');
  perform pg_temp.expect_error(format($q$insert into fault_log (asset_id, description, cause) values (%L, 'x', 'gremlins')$q$, l1),
    '%fault_log_cause_check%', 'cause comes from the list');

  -- Sahan's finding, then closing it on its own: the cost sits on the fault; today's date.
  update fault_log set cause = 'wear_and_tear', responsible_employee_id = null,
    action_taken = 'Replaced keyboard', cost = 4500, status = 'closed' where id = f1;
  select * into r from fault_log where id = f1;
  perform pg_temp.check(r.date_closed = current_date and r.updated_at is not null, 'closing dates it today');
  perform pg_temp.check(r.cost = 4500, 'a fault fixed on its own keeps its cost');

  -- send_for_repair: In Use is refused; Faulty goes Under Repair with the vendor.
  insert into fault_log (asset_id, description) values (l1, 'Will not charge') returning id into f2;
  perform pg_temp.expect_error(format($q$select send_for_repair(%L)$q$, l1), '%Return it first%',
    'In Use must be returned before repair');
  perform return_assets(jsonb_build_array(jsonb_build_object('asset_id', l1, 'next_status', 'faulty')));
  perform pg_temp.expect_error(format($q$select send_for_repair(%L, %s)$q$, l1, f1), '%not an open fault%',
    'a closed fault cannot go to the vendor');
  perform send_for_repair(l1, f2, vendor, '2026-10-02', 'Charging port');
  perform pg_temp.check((select status from assets where id = l1) = 'under_repair', 'asset Under Repair');
  select * into r from fault_log where id = f2;
  perform pg_temp.check(r.status = 'with_vendor' and r.vendor_id = vendor, 'fault With Vendor');
  select * into r from change_log where asset_id = l1 and change_type = 'sent_for_repair';
  perform pg_temp.check(r.to_text = 'Test Vendor' and r.change_date = '2026-10-02' and r.from_location_id = store,
    'Sent for Repair row names the vendor');
  perform pg_temp.expect_error(format($q$select send_for_repair(%L)$q$, l1), '%cannot be sent for repair%',
    'cannot send twice');

  -- back_from_repair, not fixed: Faulty, the fault reopens.
  perform pg_temp.expect_error(format($q$select back_from_repair(%L, 'good', 'retired')$q$, l1),
    '%Spare (fixed) or Faulty%', 'back from repair only to Spare or Faulty');
  perform back_from_repair(l1, 'poor', 'faulty', '2026-10-05');
  perform pg_temp.check((select status from assets where id = l1) = 'faulty', 'not fixed: Faulty');
  perform pg_temp.check((select status from fault_log where id = f2) = 'open', 'not fixed: the fault reopens');
  select * into r from change_log where asset_id = l1 and change_type = 'back_from_repair';
  perform pg_temp.check(r.from_text = 'Test Vendor' and r.condition = 'poor', 'Back from Repair row');

  -- Second trip, fixed: Spare, the fault closes on the return date.
  perform send_for_repair(l1, f2, vendor);
  perform back_from_repair(l1, 'good', 'spare', '2026-10-09');
  select * into r from fault_log where id = f2;
  perform pg_temp.check(r.status = 'closed' and r.date_closed = '2026-10-09', 'fixed: the fault closes');
  perform pg_temp.check((select status from assets where id = l1) = 'spare', 'fixed: Spare');
  perform pg_temp.expect_error(format($q$select back_from_repair(%L, 'good')$q$, l1), '%not Under Repair%',
    'only Under Repair comes back');

  -- record_service_job: one job, one line per AC; next due from the interval; a linked fault
  -- costs nothing on the fault and closes on the job date.
  insert into fault_log (asset_id, description) values (ac2, 'Leaking water') returning id into f3;
  job := record_service_job(
    jsonb_build_object('vendor_id', vendor, 'job_type', 'cleaning', 'service_date', '2026-10-03',
                       'invoice_no', 'INV-1', 'invoice_total', 18000),
    jsonb_build_array(
      jsonb_build_object('asset_id', ac1, 'work_done', 'Cleaned', 'cost', 6000),
      jsonb_build_object('asset_id', ac2, 'work_done', 'Cleaned and fixed leak', 'cost', 12000, 'fault_id', f3),
      jsonb_build_object('asset_id', l2, 'work_done', 'Fan cleaned', 'next_due_date', '2027-04-01')));
  perform pg_temp.check(job ~ '^SRV-[0-9]{4}$', 'service job gets an SRV number');
  perform pg_temp.check((select count(*) from service_lines l join service_jobs j on j.id = l.job_id
                         where j.job_no = job) = 3, 'one line per asset');
  perform pg_temp.check((select next_due_date from service_lines where asset_id = ac1) = date '2026-10-03' + 90,
    'next due = service date + the category interval');
  perform pg_temp.check((select next_due_date from service_lines where asset_id = l2) = '2027-04-01',
    'a given next due date is kept');
  select * into r from fault_log where id = f3;
  perform pg_temp.check(r.service_line_id = (select id from service_lines where asset_id = ac2)
    and r.cost = 0 and r.status = 'closed' and r.date_closed = '2026-10-03', 'linked fault: cost 0, closed');
  perform pg_temp.check((select sum(cost) from service_lines) = 18000, 'the cost sits on the lines');

  -- Rule 7 holds for direct edits too.
  update fault_log set cost = 999 where id = f3;
  perform pg_temp.check((select cost from fault_log where id = f3) = 0, 'a linked fault cannot take a cost');
  perform pg_temp.expect_error(format($q$update fault_log set service_line_id = (select id from service_lines where asset_id = %L) where id = %s$q$, ac1, f1),
    '%different asset%', 'a fault links only to a line for its own asset');
  perform pg_temp.expect_error(format($q$select record_service_job('{}', jsonb_build_array(jsonb_build_object('asset_id', %L, 'work_done', 'x', 'fault_id', %s)))$q$, ac1, f1),
    '%is not on PBS-ACU-001%', 'a job line links only faults on that asset');
  perform pg_temp.expect_error($q$select record_service_job('{}', '[]')$q$, '%at least one asset%', 'a job needs lines');
  perform pg_temp.expect_error(format($q$select record_service_job('{}', jsonb_build_array(jsonb_build_object('asset_id', %L, 'work_done', ' ')))$q$, ac1),
    '%service_lines_work_done_check%', 'a line says what was done');
  perform retire_asset(l2, 'Test: old');
  perform pg_temp.expect_error(format($q$select record_service_job('{}', jsonb_build_array(jsonb_build_object('asset_id', %L, 'work_done', 'x')))$q$, l2),
    '%cannot be serviced%', 'retired assets are not serviced');

  -- Nothing here can be deleted.
  perform pg_temp.expect_error($q$delete from fault_log$q$, '%permission denied%', 'faults are never deleted');
  perform pg_temp.expect_error($q$delete from service_lines$q$, '%permission denied%', 'service lines are never deleted');
  perform pg_temp.expect_error($q$delete from service_jobs$q$, '%permission denied%', 'service jobs are never deleted');

  -- Audit trail.
  perform pg_temp.check((select count(*) from audit_log where table_name = 'fault_log') >= 3, 'faults are audited');
  perform pg_temp.check(exists (select 1 from audit_log where table_name = 'service_lines'), 'service lines are audited');

  reset role;

  -- Viewer reads, changes nothing.
  perform pg_temp.act_as(viewer_id);
  perform pg_temp.check((select count(*) from fault_log) = 3 and (select count(*) from service_lines) = 3,
    'viewer reads faults and service');
  perform pg_temp.expect_error(format($q$select record_service_job('{}', jsonb_build_array(jsonb_build_object('asset_id', %L, 'work_done', 'x')))$q$, ac1),
    'not allowed', 'viewer record_service_job');
  perform pg_temp.expect_error(format($q$select send_for_repair(%L)$q$, l1), 'not allowed', 'viewer send_for_repair');
  perform pg_temp.expect_error(format($q$select back_from_repair(%L, 'good')$q$, l1), 'not allowed', 'viewer back_from_repair');
  perform pg_temp.expect_error(format($q$insert into service_jobs (job_type) values ('repair')$q$),
    '%row-level security%', 'viewer cannot add a job');
  update fault_log set remarks = 'viewer edit';
  reset role;
  perform pg_temp.check(not exists (select 1 from fault_log where remarks = 'viewer edit'), 'viewer edits change nothing');

  -- Anon: nothing.
  perform pg_temp.act_as(null);
  perform pg_temp.expect_error($q$select count(*) from fault_log$q$, '%permission denied%', 'anon reads no faults');
  perform pg_temp.expect_error($q$select count(*) from service_jobs$q$, '%permission denied%', 'anon reads no jobs');
  perform pg_temp.expect_error($q$select count(*) from stock_movements$q$, '%permission denied%', 'anon reads no stock moves');
  reset role;

  raise notice 'Faults and service: all checks passed.';
end;
$$;

rollback;
