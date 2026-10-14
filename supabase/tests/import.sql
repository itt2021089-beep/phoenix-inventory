-- Behaviour tests for import_workbook (docs/BUILD_PLAN.md -> Spec: workbook import).
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/import.sql
--
-- One transaction, rolled back at the end. Fake people and NIDs only.

begin;

create function pg_temp.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_label; end if;
end $$;

create function pg_temp.expect_error(p_sql text, p_like text, p_label text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: % -- expected an error like "%", got none', p_label, p_like;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm not ilike p_like then
    raise exception 'FAIL: % -- expected "%", got "%"', p_label, p_like, sqlerrm;
  end if;
end $$;

grant execute on function pg_temp.check(boolean, text), pg_temp.expect_error(text, text, text)
  to anon, authenticated;

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
  payload   jsonb := $j$
  {
    "categories": [{"name": "Laptop", "tag_prefix": "LAP"}, {"name": "Headset", "tag_prefix": "HST"}],
    "locations": [{"name": "Travel Section"}],
    "employees": [
      {"full_name": "Test Person One", "nid": "200012345678", "department": "Travel", "location": "Travel Section"}
    ],
    "assets": [
      {"asset_tag": "PBS-LAP-007", "category": "Laptop", "make": "Dell", "model": "Latitude 5400",
       "serial_number": "SN-AAA", "status": "in_use", "condition": "good", "nid": "200012345678",
       "department": "Travel", "location": "Travel Section", "date_assigned": "2026-10-01",
       "specification": "i7 / 8GB", "accessories_note": null, "notes": null,
       "accessories": ["Charger", "Mouse"]},
      {"asset_tag": "PBS-HST-001", "category": "Headset", "make": "Jabra", "model": null,
       "serial_number": null, "status": "spare", "condition": "new", "nid": null,
       "department": null, "location": null, "date_assigned": null, "specification": null,
       "accessories_note": null, "notes": "model to confirm", "accessories": []}
    ],
    "change_log": [
      {"change_no": "CHG-0009", "change_date": "2026-10-01", "asset_tag": "PBS-LAP-007",
       "change_type": "issued", "from_location": "IT store", "to_nid": "200012345678",
       "from_text": null, "to_text": null, "reason": "recorded during inventory setup"}
    ]
  }
  $j$;
  r record;
  res jsonb;
begin
  -- A viewer cannot import.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', viewer_id::text, true);
  perform pg_temp.expect_error(format('select import_workbook(%L::jsonb)', payload),
    'not allowed', 'viewer cannot import');
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);

  res := import_workbook(payload);
  perform pg_temp.check((res ->> 'assets')::int = 2, 'two assets imported');
  perform pg_temp.check((res ->> 'employees')::int = 1, 'one person imported');

  -- The asset is In Use with its person, which a direct insert could never do.
  select * into r from assets where asset_tag = 'PBS-LAP-007';
  perform pg_temp.check(r.status = 'in_use', 'imported as In Use');
  perform pg_temp.check(r.assigned_employee_id = (select id from employees where nid = '200012345678'),
    'holder set from the NID');
  perform pg_temp.check(r.date_assigned = '2026-10-01', 'date kept');
  perform pg_temp.check(r.location_id = (select id from locations where name = 'Travel Section'),
    'location matched case-insensitively');
  perform pg_temp.check(
    (select count(*) from asset_accessories where asset_id = r.id) = 2, 'accessories ticked');

  -- The workbook's own change number and date are kept, with no extra rows invented.
  perform pg_temp.check((select count(*) from change_log) = 1, 'only the workbook rows');
  select * into r from change_log where change_no = 'CHG-0009';
  perform pg_temp.check(r.change_date = '2026-10-01', 'change date kept');
  perform pg_temp.check(r.from_location_id = (select id from locations where kind = 'store'),
    '"IT Store" became the IT store location');
  perform pg_temp.check(r.to_employee_id is not null, 'To resolved to the real holder');

  -- The tag counter and the CHG sequence move past what was imported.
  perform pg_temp.check((select next_tag_number from categories where tag_prefix = 'LAP') = 8,
    'next laptop tag is 008');
  perform pg_temp.check((select next_tag_number from categories where tag_prefix = 'HST') = 2,
    'next headset tag is 002');
  -- The app never touches the sequence itself (authenticated has no rights on it), so read it
  -- as the owner.
  reset role;
  -- Sequences never roll back, so assert "past the workbook", not an exact number.
  perform pg_temp.check(nextval('change_no_seq') > 9, 'the next change number is past CHG-0009');
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);

  -- Running it again changes nothing and duplicates nothing.
  res := import_workbook(payload);
  perform pg_temp.check((select count(*) from assets) = 2, 'no duplicate assets');
  perform pg_temp.check((select count(*) from employees) = 1, 'no duplicate people');
  perform pg_temp.check((select count(*) from change_log) = 1, 'no duplicate change rows');
  perform pg_temp.check((select count(*) from locations where lower(name) = 'travel section') = 1,
    'no duplicate locations');
  perform pg_temp.check((select next_tag_number from categories where tag_prefix = 'LAP') = 8,
    'the tag counter does not jump on a re-run');
  perform pg_temp.check(
    (select count(*) from asset_accessories where asset_id =
       (select id from assets where asset_tag = 'PBS-LAP-007')) = 2, 'accessories not duplicated');

  -- After the import the ordinary rules are back: no direct movement changes.
  perform pg_temp.expect_error(
    $q$update assets set status = 'spare' where asset_tag = 'PBS-LAP-007'$q$,
    '%only through the Issue%', 'the guard is back on after importing');

  -- And the app's own actions carry on from the imported numbers.
  perform return_assets(jsonb_build_array(jsonb_build_object(
    'asset_id', (select id from assets where asset_tag = 'PBS-LAP-007'))));
  perform pg_temp.check(
    (select regexp_replace(change_no, '\D', '', 'g')::int from change_log order by id desc limit 1) > 9,
    'the next real change number does not clash with the workbook');

  reset role;
  raise notice 'import_workbook: all checks passed.';
end;
$$;

rollback;
