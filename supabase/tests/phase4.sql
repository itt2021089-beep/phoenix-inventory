-- Tests for Phase 4: the reminder and repair-vs-replace views, the dashboard counts, the
-- settings checks and swap_asset.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase4.sql
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
  hst smallint := (select id from categories where tag_prefix = 'HST');
  charger smallint := (select id from accessory_types where name = 'Charger');
  today date := (now() at time zone 'Asia/Colombo')::date;
  e1 uuid; desk smallint; travel smallint := (select id from departments where name = 'Travel');
  l1 uuid; l2 uuid; l3 uuid; l4 uuid; ac1 uuid; ac2 uuid; ac3 uuid; h1 uuid;
  job text; r record; fno text; n int;
begin
  perform pg_temp.act_as(admin_id);
  insert into locations (name, kind) values ('Travel desk', 'desk') returning id into desk;
  insert into employees (full_name, nid, department_id, default_location_id)
  values ('Test Person One', '200012345678', travel, desk) returning id into e1;

  -- Numbers per category (open decision 4): laptops replace at LKR 200,000; ACs have no cost set.
  update categories set typical_replacement_cost = 200000, min_spares = 2 where id = lap;
  update categories set service_interval_days = 90 where id = acu;

  perform add_assets(lap, 4, '{"make": "Dell", "model": "Latitude 5400"}');
  perform add_assets(acu, 3, jsonb_build_object('warranty_until', (today + 10)::text));
  perform add_assets(hst, 1, jsonb_build_object('purchase_price', 20000));
  select id into l1 from assets where asset_tag = 'PBS-LAP-001';
  select id into l2 from assets where asset_tag = 'PBS-LAP-002';
  select id into l3 from assets where asset_tag = 'PBS-LAP-003';
  select id into l4 from assets where asset_tag = 'PBS-LAP-004';
  select id into ac1 from assets where asset_tag = 'PBS-ACU-001';
  select id into ac2 from assets where asset_tag = 'PBS-ACU-002';
  select id into ac3 from assets where asset_tag = 'PBS-ACU-003';
  select id into h1 from assets where asset_tag = 'PBS-HST-001';

  -- ---- Settings are checked ------------------------------------------------------------
  perform pg_temp.expect_error($q$update settings set value = '"half"' where key = 'repair_replace_pct'$q$,
    '%must be a whole number from 1 to 1000%', 'a threshold must be a number');
  perform pg_temp.expect_error($q$update settings set value = '0' where key = 'reminder_window_days'$q$,
    '%from 1 to 365%', 'a window of 0 days is refused');
  perform pg_temp.expect_error($q$update settings set value = '2.5' where key = 'repeat_fault_count'$q$,
    '%whole number%', 'a fraction is refused');
  update settings set value = '"Phoenix BPO Solutions"' where key = 'company_name';

  -- ---- v_asset_costs: repair spend against the replacement basis -------------------------
  -- LAP-001: LKR 60,000 on a fault + 50,000 on a service line = 110,000 of 200,000 (typical) = 55%.
  insert into fault_log (asset_id, description, cost) values (l1, 'Motherboard', 60000);
  job := record_service_job('{"job_type":"repair"}', jsonb_build_array(
           jsonb_build_object('asset_id', l1, 'work_done', 'Screen replaced', 'cost', 50000)));
  select * into r from v_asset_costs where asset_id = l1;
  perform pg_temp.check(r.repair_spend = 110000 and r.replacement_basis = 200000
    and r.basis_source = 'typical cost' and r.spend_pct = 55.0, 'spend 110,000 of a typical 200,000 is 55%');
  perform pg_temp.check(r.flag_spend and r.flagged and not r.flag_faults, 'at or above 50% flags it on spend');

  -- LAP-002: 40% of the typical cost, one fault: not flagged.
  insert into fault_log (asset_id, description, cost) values (l2, 'Fan', 80000);
  select * into r from v_asset_costs where asset_id = l2;
  perform pg_temp.check(r.spend_pct = 40.0 and not r.flagged, '40% is not flagged');
  update settings set value = '40' where key = 'repair_replace_pct';
  perform pg_temp.check((select flagged from v_asset_costs where asset_id = l2), 'the threshold is a setting: 40% now flags it');
  update settings set value = '50' where key = 'repair_replace_pct';

  -- A fault fixed inside a service job costs 0 on the fault, so it is counted once.
  insert into fault_log (asset_id, description) values (l3, 'Hinge') returning id into n;
  job := record_service_job('{"job_type":"repair"}', jsonb_build_array(
           jsonb_build_object('asset_id', l3, 'work_done', 'Hinge fixed', 'cost', 30000, 'fault_id', n)));
  perform pg_temp.check((select repair_spend from v_asset_costs where asset_id = l3) = 30000,
    'a cost is counted once: on the service line, not again on the fault');

  -- Three faults in 12 months flags it, whatever it cost.
  insert into fault_log (asset_id, description) values (l4, 'a'), (l4, 'b');
  perform pg_temp.check(not (select flagged from v_asset_costs where asset_id = l4), 'two faults do not flag it');
  insert into fault_log (asset_id, description) values (l4, 'c');
  select * into r from v_asset_costs where asset_id = l4;
  perform pg_temp.check(r.faults_last_12m = 3 and r.flag_faults and r.flagged and not r.flag_spend,
    '3 faults in 12 months flags it');
  update fault_log set date_reported = today - 400 where asset_id = l4 and description in ('a', 'b');
  perform pg_temp.check(not (select flagged from v_asset_costs where asset_id = l4),
    'faults older than 12 months do not count');
  update settings set value = '1' where key = 'repeat_fault_months';
  update settings set value = '12' where key = 'repeat_fault_months';

  -- The purchase price beats the typical cost; no basis at all cannot be flagged on spend.
  insert into fault_log (asset_id, description, cost) values (h1, 'Mic', 12000);
  select * into r from v_asset_costs where asset_id = h1;
  perform pg_temp.check(r.replacement_basis = 20000 and r.basis_source = 'purchase price' and r.spend_pct = 60.0
    and r.flagged, 'the purchase price is the basis when there is one');
  insert into fault_log (asset_id, description, cost) values (ac1, 'Gas leak', 25000);
  select * into r from v_asset_costs where asset_id = ac1;
  perform pg_temp.check(r.replacement_basis is null and r.spend_pct is null and not r.flagged and r.no_basis,
    'no price and no typical cost: not flagged, and marked so you know to fill one in');

  -- Retired assets are never flagged.
  perform retire_asset(l1, 'Test: beyond repair');
  perform pg_temp.check(not (select flagged from v_asset_costs where asset_id = l1), 'a retired asset is not flagged');

  -- ---- v_due_soon -------------------------------------------------------------------------
  -- Warranties of the three ACs end in 10 days: within the 30-day window.
  perform pg_temp.check((select count(*) from v_due_soon where kind = 'warranty') = 3, 'a warranty ending in 10 days is due soon');
  select * into r from v_due_soon where kind = 'warranty' and asset_id = ac1;
  perform pg_temp.check(r.days_left = 10 and not r.overdue and r.category = 'Air Conditioner', 'days left and not overdue');
  update assets set warranty_until = today + 31 where id = ac2;
  update assets set warranty_until = today - 5 where id = ac3;
  perform pg_temp.check((select count(*) from v_due_soon where kind = 'warranty') = 1,
    'beyond the window, or already ended, is not a reminder');
  update settings set value = '45' where key = 'reminder_window_days';
  perform pg_temp.check((select count(*) from v_due_soon where kind = 'warranty') = 2, 'the window is a setting');
  update settings set value = '30' where key = 'reminder_window_days';

  -- Services: next due = service date + the category interval; overdue in the past.
  job := record_service_job(jsonb_build_object('job_type', 'cleaning', 'service_date', (today - 100)::text),
    jsonb_build_array(jsonb_build_object('asset_id', ac2, 'work_done', 'Cleaned')));
  select * into r from v_due_soon where kind = 'service' and asset_id = ac2;
  perform pg_temp.check(r.due_date = today - 10 and r.overdue and r.days_left = -10 and r.detail = job,
    'a service 100 days ago with a 90-day interval is 10 days overdue');
  -- A newer service replaces the older one's due date.
  job := record_service_job(jsonb_build_object('job_type', 'cleaning', 'service_date', today::text),
    jsonb_build_array(jsonb_build_object('asset_id', ac2, 'work_done', 'Cleaned again')));
  perform pg_temp.check(not exists (select 1 from v_due_soon where kind = 'service' and asset_id = ac2),
    'the latest service line decides: done today, next due in 90 days, so not due soon');
  perform retire_asset(ac1, 'Test: removed');
  perform pg_temp.check(not exists (select 1 from v_due_soon where asset_id = ac1), 'a retired asset has no reminders');

  -- ---- v_stock_levels, v_open_faults, v_dashboard ----------------------------------------
  insert into stock_movements (stock_item_id, movement_type, qty_change)
  select id, 'received', 8 from stock_items where name = 'Optical mouse';
  select * into r from v_stock_levels where name = 'Optical mouse';
  perform pg_temp.check(r.qty_on_hand = 8 and r.reorder_level = 10 and r.needs_reorder, 'stock at or below the reorder level');
  update stock_items set reorder_level = 0 where name = 'Optical mouse';
  perform pg_temp.check(not (select needs_reorder from v_stock_levels where name = 'Optical mouse'), 'a reorder level of 0 never flags');
  update stock_items set reorder_level = 10 where name = 'Optical mouse';

  -- LAP-002 goes to the person with a charger, which a swap must carry over.
  perform issue_assets(e1, jsonb_build_array(jsonb_build_object('asset_id', l2, 'accessory_type_ids', jsonb_build_array(charger))));
  insert into fault_log (asset_id, source, description, reported_by_name)
  values (l2, 'qr', 'Keys stick', 'Kamal') returning fault_no into fno;
  select * into r from v_open_faults where fault_no = fno;
  perform pg_temp.check(r.asset_tag = 'PBS-LAP-002' and r.holder = 'Test Person One' and r.age_days = 0 and r.source = 'qr',
    'an open fault shows its asset, holder and age');
  perform pg_temp.check(not exists (select 1 from v_open_faults where fault_no = (select min(fault_no) from fault_log where status = 'closed')),
    'closed faults are not listed');

  select * into r from v_dashboard;
  perform pg_temp.check(r.open_faults = (select count(*) from v_open_faults)
    and r.open_qr_faults = 1 and r.stock_to_reorder = 1
    and r.due_soon = (select count(*) from v_due_soon) and r.overdue = 0
    and r.flagged_assets = (select count(*) from v_asset_costs where flagged),
    'the dashboard counts follow the views');
  perform pg_temp.check(r.active_total > 0 and r.categories_below_min is not null, 'the Phase 1 counts are still there');

  -- ---- swap_asset ------------------------------------------------------------------------
  -- A spare of the same kind to swap in.
  perform add_assets(lap, 1, '{"make": "Dell", "model": "Latitude 5400"}');
  select id into l1 from assets where asset_tag = 'PBS-LAP-005';
  perform pg_temp.expect_error(format($q$select swap_asset(%L, %L, '  ')$q$, l2, l1),
    '%Say what is wrong%', 'a swap needs a description');
  perform pg_temp.expect_error(format($q$select swap_asset(%L, %L, 'Broken screen')$q$, l1, l1),
    '%two different assets%', 'not the same asset twice');
  perform pg_temp.expect_error(format($q$select swap_asset(%L, %L, 'Broken screen')$q$, l1, l2),
    '%not held by anyone%', 'the faulty one must be held by someone');
  perform pg_temp.expect_error(format($q$select swap_asset(%L, %L, 'Broken screen')$q$, l2, h1),
    '%not the same kind of asset%', 'only the same category can be swapped in');

  fno := swap_asset(l2, l1, 'Screen cracked', today);
  perform pg_temp.check(fno ~ '^FLT-[0-9]{4}$', 'a swap returns the new fault number');
  select * into r from assets where id = l2;
  perform pg_temp.check(r.status = 'faulty' and r.assigned_employee_id is null and r.department_id is null
    and r.location_id = (select id from locations where kind = 'store'), 'the faulty one is Faulty, in the IT store, held by nobody');
  select * into r from assets where id = l1;
  perform pg_temp.check(r.status = 'in_use' and r.assigned_employee_id = e1 and r.department_id = travel
    and r.location_id = desk and r.date_assigned = today, 'the spare takes the person, department and desk');
  perform pg_temp.check(array(select accessory_type_id from asset_accessories where asset_id = l1) = array[charger]
    and not exists (select 1 from asset_accessories where asset_id = l2), 'the charger moved to the spare');
  select * into r from fault_log where fault_no = fno;
  perform pg_temp.check(r.asset_id = l2 and r.status = 'open' and r.holder_employee_id = e1
    and r.reported_by_employee_id = e1 and r.description = 'Screen cracked', 'the fault is on the old asset, with the holder recorded');
  select * into r from change_log where asset_id = l2 and change_type = 'returned' order by id desc limit 1;
  perform pg_temp.check(r.from_employee_id = e1 and r.reason like 'Swapped for PBS-LAP-005. FLT-%: Screen cracked', 'a Returned row on the old asset');
  select * into r from change_log where asset_id = l1 and change_type = 'issued' order by id desc limit 1;
  perform pg_temp.check(r.to_employee_id = e1 and r.accessories = array['Charger'] and r.reason like 'Swapped in for PBS-LAP-002%',
    'an Issued row on the spare, listing the accessories');
  -- The existing repair actions take it from here.
  perform send_for_repair(l2, (select id from fault_log where fault_no = fno), null);
  perform pg_temp.check((select status from assets where id = l2) = 'under_repair', 'a swapped-out asset can be sent for repair');
  -- And a failed swap leaves everything as it was.
  perform pg_temp.expect_error(format($q$select swap_asset(%L, %L, 'Again')$q$, l1, l2),
    '%is not Spare%', 'the old asset is no longer Spare');
  select count(*) into n from fault_log;
  begin
    perform swap_asset(l1, l2, 'Again');
  exception when others then null;
  end;
  perform pg_temp.check((select count(*) from fault_log) = n, 'a refused swap opens no fault');

  update assets set warranty_until = today + 3 where id = ac3;
  reset role;

  -- ---- A viewer reads the views and cannot swap or change settings -----------------------
  perform pg_temp.act_as(viewer_id);
  perform pg_temp.check((select count(*) from v_asset_costs) > 0 and (select count(*) from v_due_soon) > 0
    and (select count(*) from v_open_faults) > 0 and (select count(*) from v_stock_levels) > 0, 'a viewer reads the new views');
  perform pg_temp.check((select open_faults from v_dashboard) > 0, 'and the dashboard counts');
  perform pg_temp.expect_error(format($q$select swap_asset(%L, %L, 'x')$q$, l1, l2), 'not allowed', 'viewer swap_asset');
  update settings set value = '99' where key = 'repair_replace_pct';
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'a viewer cannot change a threshold');
  reset role;

  -- Logged out and no profile: nothing (rls.sql sweeps every view; spot-check these).
  perform pg_temp.act_as(null);
  perform pg_temp.expect_error($q$select count(*) from v_asset_costs$q$, '%permission denied%', 'anon reads no costs');
  perform pg_temp.expect_error($q$select count(*) from v_due_soon$q$, '%permission denied%', 'anon reads no reminders');
  perform pg_temp.expect_error(format($q$select swap_asset(%L, %L, 'x')$q$, l1, l2), '%permission denied%', 'anon cannot swap');
  reset role;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000009', true);
  set local role authenticated;
  perform pg_temp.check((select count(*) from v_asset_costs) = 0 and (select count(*) from v_due_soon) = 0
    and (select count(*) from v_open_faults) = 0 and (select count(*) from v_stock_levels) = 0
    and (select count(*) from v_dashboard) = 0, 'a user with no profile sees nothing through any new view');
  reset role;

  raise notice 'Phase 4: all checks passed.';
end;
$$;

rollback;
