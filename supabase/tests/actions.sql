-- Behaviour tests for the Phase 1 asset actions, guard trigger and views.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/actions.sql
--
-- One transaction, rolled back at the end: it leaves no rows, and no sequence numbers matter
-- because it never runs against a database with real data (DEV is fine before an import; it
-- is NOT for PROD). Fake people and NIDs only.

begin;

-- Test helpers, private to this session.
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

-- New functions are not executable by PUBLIC by default (migration revoke_anon_function_execute),
-- and that includes these temporary helpers.
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
  lap  smallint := (select id from categories where tag_prefix = 'LAP');
  hst  smallint := (select id from categories where tag_prefix = 'HST');
  charger smallint := (select id from accessory_types where name = 'Charger');
  mouse   smallint := (select id from accessory_types where name = 'Mouse');
  store   smallint := (select id from locations where name = 'IT store');
  travel  smallint := (select id from departments where name = 'Travel');
  sales   smallint := (select id from departments where name = 'Sales');
  desk1 smallint; desk2 smallint;
  e1 uuid; e2 uuid;
  tags text[]; l1 uuid; l2 uuid; h1 uuid;
  form text; r record; n int;
begin
  perform pg_temp.act_as(admin_id);

  -- Lookups the admin can add directly.
  insert into locations (name, kind) values ('Travel section / Desk 1', 'desk') returning id into desk1;
  insert into locations (name, kind) values ('Sales room / Desk 4', 'desk') returning id into desk2;
  perform pg_temp.expect_error($q$insert into locations (name) values ('travel section / desk 1')$q$,
    '%duplicate key%', 'locations are unique case-insensitively');

  -- People. NIDs are stored normalised; the app normalises before saving.
  insert into employees (full_name, nid, department_id, default_location_id)
  values ('Test Person One', '200012345678', travel, desk1) returning id into e1;
  insert into employees (full_name, nid, department_id, default_location_id)
  values ('Test Person Two', '901234567V', sales, desk2) returning id into e2;
  perform pg_temp.expect_error($q$insert into employees (full_name, nid) values ('Bad', 'NIC 2000 1234 5678')$q$,
    '%employees_nid_check%', 'NID must be normalised');

  -- add_assets: tags in order, Received rows, counter moves on.
  tags := add_assets(lap, 2, jsonb_build_object('make', 'Dell', 'model', 'Latitude 5400', 'condition', 'good'),
                     array['SN-AAA']);
  perform pg_temp.check(tags = array['PBS-LAP-001', 'PBS-LAP-002'], 'add_assets returns tags in order');
  perform pg_temp.check((select next_tag_number from categories where id = lap) = 3, 'tag counter advanced');
  perform pg_temp.check((select count(*) from change_log where change_type = 'received_new') = 2,
    'one Received row per new asset');
  perform pg_temp.check((select status from assets where asset_tag = 'PBS-LAP-001') = 'spare', 'new assets are Spare');
  perform pg_temp.check((select location_id from assets where asset_tag = 'PBS-LAP-001') = store, 'new assets sit in the IT store');
  perform pg_temp.check((select serial_number from assets where asset_tag = 'PBS-LAP-002') is null, 'unlisted serial is null');
  perform pg_temp.expect_error($q$select add_assets((select id from categories where tag_prefix='LAP'), 1, '{}', array['sn-aaa'])$q$,
    '%assets_serial_ci%', 'serial numbers are unique case-insensitively');
  perform pg_temp.check((select next_tag_number from categories where id = lap) = 3,
    'a failed add_assets uses up no tag number');
  tags := add_assets(hst, 1, '{}');
  select id into l1 from assets where asset_tag = 'PBS-LAP-001';
  select id into l2 from assets where asset_tag = 'PBS-LAP-002';
  select id into h1 from assets where asset_tag = 'PBS-HST-001';

  -- Guard trigger (RLS checklist item 3).
  perform pg_temp.expect_error(format($q$update assets set status = 'in_use' where id = %L$q$, l1),
    '%only through the Issue%', 'direct status change is refused');
  perform pg_temp.expect_error(format($q$update assets set assigned_employee_id = %L where id = %L$q$, e1, l1),
    '%only through the Issue%', 'direct holder change is refused');
  perform pg_temp.expect_error(format($q$update assets set location_id = %s where id = %L$q$, desk1, l1),
    '%only through the Issue%', 'direct location change is refused');
  perform pg_temp.expect_error(format($q$update assets set asset_tag = 'PBS-LAP-999' where id = %L$q$, l1),
    '%never changes%', 'the tag never changes');
  perform pg_temp.expect_error($q$insert into assets (asset_tag, category_id) values ('PBS-LAP-050', 1)$q$,
    '%permission denied%', 'no direct inserts into assets');
  perform pg_temp.expect_error($q$delete from assets$q$, '%permission denied%', 'no deletes from assets');
  perform pg_temp.expect_error($q$delete from change_log$q$, '%permission denied%', 'change_log is append-only');
  perform pg_temp.expect_error($q$update change_log set reason = 'x'$q$, '%permission denied%', 'change_log rows never change');
  update assets set notes = 'edited directly' where id = l1;
  perform pg_temp.check((select notes from assets where id = l1) = 'edited directly', 'non-movement columns are editable');

  -- issue_assets
  form := issue_assets(e1, jsonb_build_array(
            jsonb_build_object('asset_id', l1, 'condition', 'good', 'accessory_type_ids', jsonb_build_array(charger, mouse)),
            jsonb_build_object('asset_id', h1, 'condition', 'new')),
          null, '2026-10-01', 'New joiner', true);
  -- Sequences never roll back, so check the shape, not the exact number.
  perform pg_temp.check(form ~ '^HO-[0-9]{4}$', 'issue makes the HO form');
  select * into r from assets where id = l1;
  perform pg_temp.check(r.status = 'in_use' and r.assigned_employee_id = e1, 'issued to the person');
  perform pg_temp.check(r.department_id = travel, 'department follows the employee');
  perform pg_temp.check(r.location_id = desk1, 'location defaults to their desk');
  perform pg_temp.check(r.date_assigned = '2026-10-01', 'date_assigned is the issue date');
  perform pg_temp.check((select count(*) from asset_accessories where asset_id = l1) = 2, 'accessories ticked');
  select * into r from change_log where asset_id = l1 and change_type = 'issued';
  perform pg_temp.check(r.accessories = array['Charger', 'Mouse'], 'change row lists the accessories');
  perform pg_temp.check(r.handover_form_id = (select id from handover_forms where form_no = form),
    'HO number stored on the change row');
  perform pg_temp.check(r.from_location_id = store and r.to_location_id = desk1, 'change row has from/to location');
  perform pg_temp.check((select count(*) from change_log c join handover_forms h on h.id = c.handover_form_id
                         where h.form_no = form) = 2, 'both items on the same form');
  perform pg_temp.expect_error(format($q$select issue_assets(%L, jsonb_build_array(jsonb_build_object('asset_id', %L)))$q$, e2, l1),
    '%is not Spare%', 'cannot issue an asset that is not Spare');

  -- Mark as left is blocked while holding.
  perform pg_temp.expect_error(format($q$update employees set status = 'left', left_on = current_date where id = %L$q$, e1),
    '%Still holds: PBS-HST-001, PBS-LAP-001%', 'mark as left blocked while holding');

  -- transfer_assets: department and desk follow the new person, accessories go along.
  form := transfer_assets(e1, e2, array[l1], true, '2026-10-05');
  select * into r from assets where id = l1;
  perform pg_temp.check(r.assigned_employee_id = e2 and r.department_id = sales and r.location_id = desk2,
    'transfer: person, department and desk follow');
  perform pg_temp.check((select count(*) from asset_accessories where asset_id = l1) = 2, 'transfer keeps accessories');
  perform pg_temp.check((select from_employee_id from handover_forms where form_no = form) = e1, 'transfer form has from');
  perform pg_temp.expect_error(format($q$select transfer_assets(%L, %L, array[%L]::uuid[])$q$, e1, e2, l1),
    '%is not held by%', 'cannot transfer what they do not hold');

  -- return_assets: mixed holders refused; then a clean return.
  perform pg_temp.expect_error(format($q$select return_assets(jsonb_build_array(jsonb_build_object('asset_id', %L), jsonb_build_object('asset_id', %L)))$q$, l1, h1),
    '%one person''s items at a time%', 'return refuses mixed holders');
  form := return_assets(jsonb_build_array(jsonb_build_object(
            'asset_id', l1, 'condition', 'fair', 'next_status', 'spare',
            'accessories_returned', jsonb_build_array(charger, mouse))),
          'good', 'yes', 'Role change', true, '2026-10-10');
  select * into r from assets where id = l1;
  perform pg_temp.check(r.status = 'spare' and r.assigned_employee_id is null, 'return: Spare, no holder');
  perform pg_temp.check(r.location_id = store and r.department_id is null, 'return: IT store, no department');
  perform pg_temp.check(r.condition = 'fair', 'return records the condition');
  perform pg_temp.check(array(select accessory_type_id from asset_accessories where asset_id = l1) = array[charger],
    'return: Charger stays with the laptop, Mouse goes back to stock');
  select * into r from change_log where asset_id = l1 and change_type = 'returned';
  perform pg_temp.check(r.from_employee_id = e2 and r.accessories = array['Charger', 'Mouse'], 'returned row');
  perform pg_temp.check((select return_condition from handover_forms where form_no = form) = 'good', 'return form');

  -- Missing accessories come off the asset and are recorded.
  form := issue_assets(e2, jsonb_build_array(jsonb_build_object('asset_id', l1, 'accessory_type_ids', jsonb_build_array(charger))));
  perform pg_temp.check(form is null, 'no form unless asked');
  perform return_assets(jsonb_build_array(jsonb_build_object(
            'asset_id', l1, 'next_status', 'faulty', 'accessories_missing', jsonb_build_array(charger),
            'fault_description', 'Screen flickers')));
  perform pg_temp.check((select count(*) from asset_accessories where asset_id = l1) = 0, 'missing charger removed');
  select * into r from change_log where asset_id = l1 and change_type = 'returned' order by id desc limit 1;
  perform pg_temp.check(r.accessories_missing = array['Charger'] and r.reason like '%Screen flickers%',
    'missing accessories and fault text recorded');
  perform pg_temp.check((select status from assets where id = l1) = 'faulty', 'returned as Faulty');
  perform pg_temp.expect_error(format($q$select return_assets(jsonb_build_array(jsonb_build_object('asset_id', %L, 'next_status', 'retired')))$q$, h1),
    '%must be Spare, Under Repair or Faulty%', 'return cannot retire');

  -- move_asset
  perform move_asset(l2, desk1, null, 'Shared desk');
  select * into r from change_log where asset_id = l2 and change_type = 'location_changed';
  perform pg_temp.check(r.to_location_id = desk1 and r.to_text = 'Common', 'move: location and department recorded');
  perform pg_temp.expect_error(format($q$select move_asset(%L, %s::smallint, null)$q$, l2, desk1), '%Nothing to change%', 'move to the same place refused');

  -- retire / dispose
  perform pg_temp.expect_error(format($q$select retire_asset(%L, '  ')$q$, l2), '%Give a reason%', 'retire needs a reason');
  perform retire_asset(l2, 'Battery dead, beyond repair');
  perform pg_temp.expect_error(format($q$select retire_asset(%L, 'again')$q$, l2), '%already retired%', 'cannot retire twice');
  perform pg_temp.expect_error(format($q$select issue_assets(%L, jsonb_build_array(jsonb_build_object('asset_id', %L)))$q$, e2, l2),
    '%is not Spare%', 'cannot issue a retired asset');
  perform dispose_asset(l2, 'Sent to e-waste');
  perform pg_temp.check((select status from assets where id = l2) = 'disposed', 'disposed');
  perform pg_temp.expect_error(format($q$select dispose_asset(%L, 'again')$q$, l2), '%already disposed%', 'cannot dispose twice');

  -- Mark as left works once they hold nothing.
  perform return_assets(jsonb_build_array(jsonb_build_object('asset_id', h1)));
  update employees set status = 'left', left_on = current_date where id = e1;
  perform pg_temp.check((select status from employees where id = e1) = 'left', 'mark as left once empty-handed');
  perform pg_temp.expect_error(format($q$select issue_assets(%L, jsonb_build_array(jsonb_build_object('asset_id', %L)))$q$, e1, h1),
    '%has left%', 'cannot issue to someone who left');

  -- Every asset's current state is explained by its Change Log.
  perform pg_temp.check(not exists (select 1 from assets a where not exists
    (select 1 from change_log c where c.asset_id = a.id)), 'every asset has change rows');

  -- Views
  select * into r from v_category_summary where category = 'Laptop';
  perform pg_temp.check(r.active_total = 1 and r.faulty = 1, 'v_category_summary counts active laptops');
  select * into r from v_dashboard;
  perform pg_temp.check(r.active_total = 2 and r.faulty_or_repair = 1 and r.spare_total = 1, 'v_dashboard counts');
  perform pg_temp.check(not exists (select 1 from v_employee_holdings), 'nobody holds anything now');

  -- Audit trail
  perform pg_temp.check((select count(*) from audit_log where table_name = 'assets' and record_id = l1::text) >= 5,
    'audit log records asset changes');
  perform pg_temp.check((select user_id from audit_log where table_name = 'employees' order by id desc limit 1) = admin_id,
    'audit log records who');

  reset role;

  -- Viewer: reads everything, every action says 'not allowed' (RLS checklist item 2).
  perform pg_temp.act_as(viewer_id);
  perform pg_temp.check((select count(*) from assets) = 3, 'viewer reads assets');
  perform pg_temp.check((select count(*) from change_log) > 0, 'viewer reads the change log');
  perform pg_temp.expect_error(format($q$select add_assets(%s::smallint, 1)$q$, lap), 'not allowed', 'viewer add_assets');
  perform pg_temp.expect_error(format($q$select next_asset_tag(%s::smallint)$q$, lap), 'not allowed', 'viewer next_asset_tag');
  perform pg_temp.expect_error(format($q$select issue_assets(%L, '[]')$q$, e2), 'not allowed', 'viewer issue_assets');
  perform pg_temp.expect_error($q$select return_assets('[]')$q$, 'not allowed', 'viewer return_assets');
  perform pg_temp.expect_error(format($q$select transfer_assets(%L, %L, '{}')$q$, e1, e2), 'not allowed', 'viewer transfer_assets');
  perform pg_temp.expect_error(format($q$select move_asset(%L, null, null)$q$, h1), 'not allowed', 'viewer move_asset');
  perform pg_temp.expect_error(format($q$select retire_asset(%L, 'x')$q$, h1), 'not allowed', 'viewer retire_asset');
  perform pg_temp.expect_error(format($q$select dispose_asset(%L, 'x')$q$, h1), 'not allowed', 'viewer dispose_asset');
  -- Under RLS a viewer's update matches no rows: no error, and nothing changes.
  update assets set notes = 'viewer edit';
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'viewer update of assets matches no rows');
  perform pg_temp.expect_error($q$insert into employees (full_name, nid) values ('X', '200099999999')$q$,
    '%row-level security%', 'viewer cannot add people');
  update categories set min_spares = 9;
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'viewer update of categories matches no rows');
  reset role;
  perform pg_temp.check((select count(*) from assets where notes = 'viewer edit') = 0, 'viewer edits changed nothing');
  perform pg_temp.check((select count(*) from categories where min_spares = 9) = 0, 'viewer category edits changed nothing');

  raise notice 'Asset actions: all checks passed.';
end;
$$;

rollback;
