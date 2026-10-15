-- Department follows the person, and admin corrections of status, department and accessories
-- (migration department_follows_person).
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/department.sql
--
-- One transaction, rolled back. Fake people only. Like the other suites, never run it against
-- PROD: it uses up CHG numbers even though it rolls back.

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
  ('e0000000-0000-0000-0000-000000000001', 'admin@example.test'),
  ('e0000000-0000-0000-0000-000000000002', 'viewer@example.test');
insert into public.profiles (id, full_name, role) values
  ('e0000000-0000-0000-0000-000000000001', 'Test Admin', 'admin'),
  ('e0000000-0000-0000-0000-000000000002', 'Test Viewer', 'viewer');

do $$
declare
  admin_id  uuid := 'e0000000-0000-0000-0000-000000000001';
  viewer_id uuid := 'e0000000-0000-0000-0000-000000000002';
  lap smallint := (select id from categories where tag_prefix = 'LAP');
  sales smallint := (select id from departments where name = 'Sales');
  travel smallint := (select id from departments where name = 'Travel');
  charger smallint := (select id from accessory_types where name = 'Charger');
  bag smallint := (select id from accessory_types where name = 'Bag');
  e1 uuid; tags text[]; l1 uuid; l2 uuid; l3 uuid; n int; r record;
begin
  perform pg_temp.act_as(admin_id);
  insert into employees (full_name, nid, department_id) values ('Test Dept Person', '199900000031', sales)
  returning id into e1;
  tags := add_assets(lap, 3, '{"make": "Dell"}');
  select id into l1 from assets where asset_tag = tags[1];
  select id into l2 from assets where asset_tag = tags[2];
  select id into l3 from assets where asset_tag = tags[3];
  perform issue_assets(e1, jsonb_build_array(jsonb_build_object('asset_id', l1), jsonb_build_object('asset_id', l2)));
  perform pg_temp.check((select count(*) from assets where assigned_employee_id = e1 and department_id = sales) = 2,
    'issued items take the person''s department');

  -- Department follows the person.
  update employees set department_id = travel where id = e1;
  perform pg_temp.check((select count(*) from assets where assigned_employee_id = e1 and department_id = travel) = 2,
    'changing the person''s department moves everything they hold');
  select count(*) into n from change_log where asset_id in (l1, l2) and change_type = 'department_changed'
    and from_text = 'Sales' and to_text = 'Travel';
  perform pg_temp.check(n = 2, 'one Department Changed row per item, Sales -> Travel');
  update employees set designation = 'Agent' where id = e1;
  perform pg_temp.check((select count(*) from change_log where asset_id in (l1, l2) and change_type = 'department_changed') = 2,
    'editing anything else about the person writes no department row');
  update employees set department_id = null where id = e1;
  perform pg_temp.check((select department_id from assets where id = l1) is null, 'no department: their items become Common');

  -- change_asset_department: shared items only.
  perform pg_temp.expect_error(format('select change_asset_department(%L, %s::smallint)', l1, sales),
    '%follows its holder%', 'a held item follows its holder, so it cannot be moved on its own');
  perform change_asset_department(l3, sales, 'Printer room');
  perform pg_temp.check((select department_id from assets where id = l3) = sales, 'a shared item changes department');
  perform pg_temp.check((select to_text from change_log where asset_id = l3 order by id desc limit 1) = 'Sales',
    'and the Change Log says so');
  perform pg_temp.expect_error(format('select change_asset_department(%L, %s::smallint)', l3, sales), '%Nothing to change%',
    'the same department again is refused');

  -- change_asset_status.
  perform pg_temp.expect_error(format('select change_asset_status(%L, %L, %L)', l1, 'lost_stolen', ' '),
    '%Say why%', 'a status change needs a reason');
  perform change_asset_status(l1, 'lost_stolen', 'Left in a taxi');
  select * into r from assets where id = l1;
  perform pg_temp.check(r.status = 'lost_stolen' and r.assigned_employee_id is null,
    'nobody holds a Lost / Stolen item (audit M1)');
  perform pg_temp.check((select from_employee_id from change_log where asset_id = l1 order by id desc limit 1) = e1,
    'the Change Log keeps who had it');
  perform pg_temp.check((select from_text || '>' || to_text from change_log where asset_id = l1 order by id desc limit 1) = 'In Use>Lost / Stolen',
    'the Change Log shows the labels, not the codes');
  perform pg_temp.expect_error(format('select change_asset_status(%L, %L, %L)', l2, 'spare', 'x'),
    '%use Return%', 'taking an item back from someone stays with Return');
  perform pg_temp.expect_error(format('select change_asset_status(%L, %L, %L)', l2, 'faulty', 'x'),
    '%use Return%', 'a held item cannot be made Faulty here (audit H2): Return does that');
  perform pg_temp.expect_error(format('select change_asset_status(%L, %L, %L)', l2, 'under_repair', 'x'),
    '%use Return%', 'nor Under Repair');
  perform pg_temp.expect_error(format('select send_for_repair(%L)', l2),
    '%Return it first%', 'send for repair refuses an item someone holds');

  -- An item that reached Under Repair with a holder before the fix comes back Spare cleanly.
  reset role;
  perform set_config('app.via_rpc', 'on', true);
  update assets set status = 'under_repair' where id = l2;
  perform set_config('app.via_rpc', '', true);
  perform pg_temp.act_as(admin_id);
  perform back_from_repair(l2, 'good', 'spare');
  select * into r from assets where id = l2;
  perform pg_temp.check(r.status = 'spare' and r.assigned_employee_id is null and r.department_id is null,
    'back from repair as Spare clears the holder instead of failing (audit H2)');

  -- With the lost item cleared and the other one back as Spare, the person can leave (audit M1).
  update employees set status = 'left', left_on = (now() at time zone 'Asia/Colombo')::date where id = e1;
  perform pg_temp.check((select status from employees where id = e1) = 'left',
    'someone whose item was lost can be marked Left');
  perform pg_temp.expect_error(format('select change_asset_status(%L, %L, %L)', l3, 'retired', 'x'),
    '%Retire or Dispose%', 'Retired and Disposed keep their own actions');

  -- set_asset_accessories: a correction, no stock movement.
  select count(*) into n from stock_movements;
  perform set_asset_accessories(l3, array[charger, bag]::smallint[]);
  perform pg_temp.check((select count(*) from asset_accessories where asset_id = l3) = 2, 'accessories set');
  perform set_asset_accessories(l3, array[charger]::smallint[]);
  perform pg_temp.check((select array_agg(accessory_type_id) from asset_accessories where asset_id = l3) = array[charger],
    'an unticked accessory comes off');
  perform pg_temp.check((select count(*) from stock_movements) = n, 'a correction moves no stock');
  select count(*) into n from change_log where asset_id = l3 and change_type = 'accessories_changed';
  perform set_asset_accessories(l3, array[charger]::smallint[]);
  perform pg_temp.check((select count(*) from change_log where asset_id = l3 and change_type = 'accessories_changed') = n,
    'saving the same accessories again writes no row');
  reset role;

  -- Nobody but the admin may use them.
  perform pg_temp.act_as(viewer_id);
  perform pg_temp.expect_error(format('select change_asset_status(%L, %L, %L)', l3, 'faulty', 'x'), '%not allowed%', 'viewer: change_asset_status');
  perform pg_temp.expect_error(format('select change_asset_department(%L, null)', l3), '%not allowed%', 'viewer: change_asset_department');
  perform pg_temp.expect_error(format('select set_asset_accessories(%L, null)', l3), '%not allowed%', 'viewer: set_asset_accessories');
  -- RLS filters a viewer's update to nothing (no error, 0 rows), so the check below is what counts.
  execute format('update employees set department_id = %s::smallint where id = %L', sales, e1);
  reset role;
  perform pg_temp.check((select department_id from employees where id = e1) is null, 'and the person is unchanged');
  perform pg_temp.act_as(null);
  perform pg_temp.expect_error(format('select change_asset_status(%L, %L, %L)', l3, 'faulty', 'x'), '%permission denied%', 'logged out: change_asset_status');
  perform pg_temp.expect_error(format('select set_asset_accessories(%L, null)', l3), '%permission denied%', 'logged out: set_asset_accessories');
  reset role;

  raise notice 'Department and corrections: all checks passed.';
end $$;

rollback;
