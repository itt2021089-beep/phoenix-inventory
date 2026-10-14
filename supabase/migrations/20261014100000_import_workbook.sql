-- Phase 1: bring the Excel workbook in (docs/BUILD_PLAN.md -> Spec: workbook import).
--
-- Why this needs its own function rather than the ordinary actions:
--   - the guard trigger rightly refuses a direct insert into assets, or setting one In Use;
--   - the existing CHG numbers and their real dates must be kept, which issue_assets cannot
--     do: it would write new numbers dated today;
--   - only SQL can move the sequences past the numbers already used.
--
-- It is admin-only, runs as one transaction, and is safe to run twice: everything is matched
-- on its natural key (tag, NID, change number, name), so a second run updates instead of
-- duplicating. It writes no new Change Log rows of its own.
--
-- The browser parses the workbook and sends this payload (names, not ids):
--   categories  [{name, tag_prefix}]
--   locations   [{name}]
--   employees   [{full_name, nid, department, location}]
--   assets      [{asset_tag, category, make, model, serial_number, status, condition, nid,
--                 department, location, date_assigned, specification, accessories_note,
--                 notes, accessories[]}]
--   change_log  [{change_no, change_date, asset_tag, change_type, from_location, to_nid,
--                 from_text, to_text, reason}]

create or replace function public.import_workbook(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item        jsonb;
  moves_prev  text;
  v_asset_id  uuid;
  v_tag       text;
  v_prefix    text;
  v_number    int;
  result      jsonb := '{}';
  n_categories int := 0;
  n_locations  int := 0;
  n_employees  int := 0;
  n_assets     int := 0;
  n_changes    int := 0;
  n_accessories int := 0;
  max_change   int := 0;
begin
  perform public._require_admin();

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Nothing to import';
  end if;

  -- 1. Categories. Existing ones keep their settings; only missing ones are created.
  for item in select * from jsonb_array_elements(coalesce(p_payload -> 'categories', '[]')) loop
    insert into public.categories (name, tag_prefix)
    values (item ->> 'name', upper(item ->> 'tag_prefix'))
    on conflict (name) do nothing;
    if found then n_categories := n_categories + 1; end if;
  end loop;

  -- 2. Locations, matched case-insensitively (locations_name_ci).
  for item in select * from jsonb_array_elements(coalesce(p_payload -> 'locations', '[]')) loop
    if not exists (select 1 from public.locations where lower(name) = lower(item ->> 'name')) then
      insert into public.locations (name, kind) values (item ->> 'name', 'other');
      n_locations := n_locations + 1;
    end if;
  end loop;

  -- 3. People, matched on the normalised NID.
  for item in select * from jsonb_array_elements(coalesce(p_payload -> 'employees', '[]')) loop
    insert into public.employees (full_name, nid, department_id, default_location_id)
    values (
      item ->> 'full_name',
      item ->> 'nid',
      (select id from public.departments where name = item ->> 'department'),
      (select id from public.locations where lower(name) = lower(item ->> 'location'))
    )
    on conflict (nid) do update set
      full_name = excluded.full_name,
      department_id = coalesce(excluded.department_id, public.employees.department_id),
      default_location_id = coalesce(excluded.default_location_id, public.employees.default_location_id);
    n_employees := n_employees + 1;
  end loop;

  -- 4. Assets, matched on the tag. The import sets movement columns directly, which is what
  -- the flag below allows; the Change Log rows for them come from the workbook in step 5.
  moves_prev := public._allow_asset_moves();

  for item in select * from jsonb_array_elements(coalesce(p_payload -> 'assets', '[]')) loop
    insert into public.assets (
      asset_tag, category_id, make, model, serial_number, status, condition,
      assigned_employee_id, department_id, location_id, date_assigned, specification,
      accessories_note, notes)
    values (
      item ->> 'asset_tag',
      (select id from public.categories where name = item ->> 'category'),
      item ->> 'make',
      item ->> 'model',
      item ->> 'serial_number',
      coalesce(item ->> 'status', 'spare'),
      coalesce(item ->> 'condition', 'good'),
      (select id from public.employees where nid = item ->> 'nid'),
      (select id from public.departments where name = item ->> 'department'),
      (select id from public.locations where lower(name) = lower(item ->> 'location')),
      (item ->> 'date_assigned')::date,
      item ->> 'specification',
      item ->> 'accessories_note',
      item ->> 'notes')
    on conflict (asset_tag) do update set
      category_id = excluded.category_id,
      make = excluded.make,
      model = excluded.model,
      serial_number = excluded.serial_number,
      status = excluded.status,
      condition = excluded.condition,
      assigned_employee_id = excluded.assigned_employee_id,
      department_id = excluded.department_id,
      location_id = excluded.location_id,
      date_assigned = excluded.date_assigned,
      specification = excluded.specification,
      accessories_note = excluded.accessories_note,
      notes = excluded.notes
    returning id into v_asset_id;
    n_assets := n_assets + 1;

    -- Accessories on the asset are replaced by what the workbook says.
    delete from public.asset_accessories where asset_id = v_asset_id;
    insert into public.asset_accessories (asset_id, accessory_type_id)
    select v_asset_id, t.id
    from jsonb_array_elements_text(coalesce(item -> 'accessories', '[]')) as a(name)
    join public.accessory_types t on lower(t.name) = lower(a.name);
    n_accessories := n_accessories + (select count(*) from public.asset_accessories where asset_id = v_asset_id);

    -- Each category's next tag number goes past the highest number imported for it.
    v_tag := item ->> 'asset_tag';
    v_prefix := split_part(v_tag, '-', 2);
    v_number := nullif(regexp_replace(split_part(v_tag, '-', 3), '\D', '', 'g'), '')::int;
    if v_number is not null then
      update public.categories
      set next_tag_number = greatest(next_tag_number, v_number + 1)
      where tag_prefix = v_prefix;
    end if;
  end loop;

  -- 5. The Change Log, keeping the workbook's numbers and dates.
  for item in select * from jsonb_array_elements(coalesce(p_payload -> 'change_log', '[]')) loop
    insert into public.change_log (
      change_no, change_date, asset_id, change_type, to_employee_id, from_location_id,
      from_text, to_text, reason)
    values (
      item ->> 'change_no',
      coalesce((item ->> 'change_date')::date, current_date),
      (select id from public.assets where asset_tag = item ->> 'asset_tag'),
      item ->> 'change_type',
      (select id from public.employees where nid = item ->> 'to_nid'),
      (select id from public.locations where lower(name) = lower(item ->> 'from_location')),
      item ->> 'from_text',
      item ->> 'to_text',
      item ->> 'reason')
    on conflict (change_no) do update set
      change_date = excluded.change_date,
      change_type = excluded.change_type,
      to_employee_id = excluded.to_employee_id,
      from_location_id = excluded.from_location_id,
      from_text = excluded.from_text,
      to_text = excluded.to_text,
      reason = excluded.reason;
    n_changes := n_changes + 1;

    max_change := greatest(
      max_change,
      coalesce(nullif(regexp_replace(item ->> 'change_no', '\D', '', 'g'), '')::int, 0));
  end loop;

  -- 6. Move the CHG sequence past the imported numbers, so the next change written by the app
  -- does not collide with one from the workbook.
  if max_change > 0 then
    perform setval('public.change_no_seq', greatest(max_change, (select last_value from public.change_no_seq)));
  end if;

  perform public._restore_asset_moves(moves_prev);

  result := jsonb_build_object(
    'categories', n_categories,
    'locations', n_locations,
    'employees', n_employees,
    'assets', n_assets,
    'accessories', n_accessories,
    'changes', n_changes);
  return result;
end;
$$;

revoke all on function public.import_workbook(jsonb) from public, anon, authenticated;
grant execute on function public.import_workbook(jsonb) to authenticated;

comment on function public.import_workbook(jsonb) is
  'Admin-only. Imports the Excel workbook in one transaction. Safe to re-run: everything is '
  'matched on its natural key. Keeps the workbook''s CHG numbers and dates and moves the '
  'sequence past them.';
