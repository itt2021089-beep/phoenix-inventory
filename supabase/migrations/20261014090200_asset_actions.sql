-- Phase 1: the asset actions (docs/SCHEMA.md -> RPC functions).
--
-- Each one:
--   - is security definer with search_path = public, and calls is_admin() first;
--   - runs as one transaction (a function call always does), so the asset and its Change Log
--     rows change together or not at all;
--   - sets app.via_rpc = 'on' for this transaction only, which is what lets it past the
--     assets guard trigger;
--   - is executable by authenticated only. anon has no execute on new functions (migration
--     revoke_anon_function_execute), and viewers get 'not allowed'.
-- Stock deduction for accessories linked to a stock item is a no-op until Phase 2 adds
-- stock_movements; the places it will go are marked "Phase 2: stock".

-- ---------------------------------------------------------------------------
-- Internal helpers (no grants: callable only from the functions below)
-- ---------------------------------------------------------------------------
create or replace function public._require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end;
$$;

-- set_config(..., true) lasts until the end of the TRANSACTION, not the function. So each action
-- switches the flag on, and puts back the previous value before it returns; otherwise a direct
-- update later in the same transaction (SQL editor, a future function) would slip past the
-- guard. On an error the whole transaction rolls back, flag included.
create or replace function public._allow_asset_moves()
returns text
language plpgsql
set search_path = public
as $$
declare
  previous text := coalesce(current_setting('app.via_rpc', true), '');
begin
  perform set_config('app.via_rpc', 'on', true);
  return previous;
end;
$$;

create or replace function public._restore_asset_moves(p_previous text)
returns void
language sql
set search_path = public
as $$
  select set_config('app.via_rpc', coalesce(p_previous, ''), true);
$$;

-- The IT store: where returned assets go unless told otherwise.
create or replace function public._it_store_id()
returns smallint
language sql
stable
set search_path = public
as $$
  select id from public.locations where kind = 'store' and is_active order by id limit 1;
$$;

-- Names of accessory types, for the readable copy on a Change Log row.
create or replace function public._accessory_names(p_ids smallint[])
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(name order by name), '{}')
  from public.accessory_types where id = any (coalesce(p_ids, '{}'));
$$;

-- jsonb array of numbers -> smallint[]
create or replace function public._smallint_array(p jsonb)
returns smallint[]
language sql
immutable
as $$
  select coalesce(array_agg(value::smallint), '{}')
  from jsonb_array_elements_text(coalesce(p, '[]'));
$$;

-- ---------------------------------------------------------------------------
-- next_asset_tag(category_id): PBS-<prefix>-<NNN>, never reused.
-- ---------------------------------------------------------------------------
create or replace function public.next_asset_tag(p_category_id smallint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
begin
  perform public._require_admin();

  select tag_prefix, next_tag_number into c
  from public.categories where id = p_category_id
  for update;
  if not found then
    raise exception 'Unknown category %', p_category_id;
  end if;

  update public.categories set next_tag_number = c.next_tag_number + 1 where id = p_category_id;
  return 'PBS-' || c.tag_prefix || '-' || lpad(c.next_tag_number::text, 3, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- add_assets(category, qty, fields, serials): bulk-create Spare assets, each with a
-- Received (New) row. Returns the new tags in order. Also used for "Duplicate this asset".
-- fields: make, model, condition, specification, custom_values, accessories_note,
--         purchase_date, purchase_price, supplier_id, invoice_no, warranty_until, notes,
--         location_id (default: IT store), department_id, received_date (default: today)
-- ---------------------------------------------------------------------------
create or replace function public.add_assets(
  p_category_id smallint,
  p_qty         int,
  p_fields      jsonb default '{}',
  p_serials     text[] default '{}'
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  moves_prev text;
  f        jsonb := coalesce(p_fields, '{}');
  serials  text[] := coalesce(p_serials, '{}');
  loc      smallint := coalesce((f ->> 'location_id')::smallint, public._it_store_id());
  rdate    date := coalesce((f ->> 'received_date')::date, current_date);
  tags     text[] := '{}';
  tag      text;
  new_id   uuid;
  serial   text;
begin
  perform public._require_admin();

  if p_qty is null or p_qty < 1 or p_qty > 200 then
    raise exception 'Quantity must be between 1 and 200';
  end if;
  if cardinality(serials) > p_qty then
    raise exception 'More serial numbers (%) than assets (%)', cardinality(serials), p_qty;
  end if;
  if not exists (select 1 from public.categories where id = p_category_id and is_active) then
    raise exception 'Unknown or inactive category %', p_category_id;
  end if;

  moves_prev := public._allow_asset_moves();

  for i in 1 .. p_qty loop
    tag := public.next_asset_tag(p_category_id);
    serial := nullif(btrim(serials[i]), '');

    insert into public.assets (
      asset_tag, category_id, make, model, serial_number, status, condition,
      department_id, location_id, specification, custom_values, accessories_note,
      purchase_date, purchase_price, supplier_id, invoice_no, warranty_until, notes)
    values (
      tag, p_category_id, nullif(btrim(f ->> 'make'), ''), nullif(btrim(f ->> 'model'), ''),
      serial, 'spare', coalesce(f ->> 'condition', 'new'),
      (f ->> 'department_id')::smallint, loc, nullif(btrim(f ->> 'specification'), ''),
      coalesce(f -> 'custom_values', '{}'), nullif(btrim(f ->> 'accessories_note'), ''),
      (f ->> 'purchase_date')::date, (f ->> 'purchase_price')::numeric,
      (f ->> 'supplier_id')::bigint, nullif(btrim(f ->> 'invoice_no'), ''),
      (f ->> 'warranty_until')::date, nullif(btrim(f ->> 'notes'), ''))
    returning id into new_id;

    insert into public.change_log (change_date, asset_id, change_type, to_location_id, condition, reason)
    values (rdate, new_id, 'received_new', loc, coalesce(f ->> 'condition', 'new'),
            nullif(btrim(f ->> 'reason'), ''));

    tags := tags || tag;
  end loop;

  perform public._restore_asset_moves(moves_prev);
  return tags;
end;
$$;

-- ---------------------------------------------------------------------------
-- issue_assets: Spare -> In Use with a person.
-- items: [{asset_id, condition, accessory_type_ids: [..]}]
-- Location defaults to the employee's desk, department follows the employee, date to today.
-- Returns the HO form number when p_make_form, else null.
-- ---------------------------------------------------------------------------
create or replace function public.issue_assets(
  p_employee_id uuid,
  p_items       jsonb,
  p_location_id smallint default null,
  p_issue_date  date default null,
  p_reason      text default null,
  p_make_form   boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  moves_prev text;
  emp      public.employees;
  a        public.assets;
  item     jsonb;
  acc_ids  smallint[];
  loc      smallint;
  idate    date := coalesce(p_issue_date, current_date);
  form     public.handover_forms;
begin
  perform public._require_admin();

  select * into emp from public.employees where id = p_employee_id;
  if not found then raise exception 'Unknown employee'; end if;
  if emp.status <> 'active' then raise exception '% has left', emp.full_name; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pick at least one asset to issue';
  end if;

  loc := coalesce(p_location_id, emp.default_location_id);

  if p_make_form then
    insert into public.handover_forms (form_date, purpose, employee_id, remarks)
    values (idate, 'issue', emp.id, nullif(btrim(p_reason), ''))
    returning * into form;
  end if;

  moves_prev := public._allow_asset_moves();

  for item in select * from jsonb_array_elements(p_items) loop
    select * into a from public.assets where id = (item ->> 'asset_id')::uuid for update;
    if not found then raise exception 'Unknown asset %', item ->> 'asset_id'; end if;
    if a.status <> 'spare' then
      raise exception '% is not Spare (it is %), so it cannot be issued', a.asset_tag, a.status;
    end if;

    acc_ids := public._smallint_array(item -> 'accessory_type_ids');

    update public.assets set
      status = 'in_use',
      assigned_employee_id = emp.id,
      department_id = emp.department_id,
      location_id = loc,
      date_assigned = idate,
      condition = coalesce(item ->> 'condition', a.condition)
    where id = a.id;

    delete from public.asset_accessories where asset_id = a.id;
    insert into public.asset_accessories (asset_id, accessory_type_id)
    select a.id, unnest(acc_ids) on conflict do nothing;
    -- Phase 2: stock. Deduct 1 for each ticked accessory linked to a stock item.

    insert into public.change_log (
      change_date, asset_id, change_type, to_employee_id, from_location_id, to_location_id,
      condition, accessories, reason, handover_form_id)
    values (
      idate, a.id, 'issued', emp.id, a.location_id, loc,
      coalesce(item ->> 'condition', a.condition), public._accessory_names(acc_ids),
      nullif(btrim(p_reason), ''), form.id);
  end loop;

  perform public._restore_asset_moves(moves_prev);
  return form.form_no;
end;
$$;

-- ---------------------------------------------------------------------------
-- return_assets: back to IT. All items must be held by the same person (or by nobody).
-- items: [{asset_id, condition, accessories_returned: [..], accessories_missing: [..],
--          next_status: 'spare'|'under_repair'|'faulty', fault_description?}]
-- Returned accessories linked to a stock item go back into stock (Phase 2: stock), so they
-- come off the asset; other returned accessories (charger, bag) stay with it. Missing ones
-- come off. The asset goes to p_location_id, default the IT store, and serves no department.
-- fault_description is kept in the row's reason until Phase 2 opens a real fault from it.
-- ---------------------------------------------------------------------------
create or replace function public.return_assets(
  p_items             jsonb,
  p_return_condition  text default null,
  p_data_backed_up    text default null,
  p_remarks           text default null,
  p_make_form         boolean default false,
  p_return_date       date default null,
  p_location_id       smallint default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  moves_prev text;
  a         public.assets;
  item      jsonb;
  holder    uuid;
  first     boolean := true;
  returned  smallint[];
  missing   smallint[];
  current_acc smallint[];
  nstatus   text;
  loc       smallint := coalesce(p_location_id, public._it_store_id());
  rdate     date := coalesce(p_return_date, current_date);
  reason    text;
  form      public.handover_forms;
begin
  perform public._require_admin();

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pick at least one asset to return';
  end if;

  -- Lock every asset first, and check they share one holder.
  for item in select * from jsonb_array_elements(p_items) loop
    select * into a from public.assets where id = (item ->> 'asset_id')::uuid for update;
    if not found then raise exception 'Unknown asset %', item ->> 'asset_id'; end if;
    if a.status <> 'in_use' then
      raise exception '% is not In Use (it is %), so it cannot be returned', a.asset_tag, a.status;
    end if;
    if first then
      holder := a.assigned_employee_id; first := false;
    elsif holder is distinct from a.assigned_employee_id then
      raise exception 'Return one person''s items at a time (% is held by someone else)', a.asset_tag;
    end if;
  end loop;

  if p_make_form then
    if holder is null then
      raise exception 'A handover form needs a person; these items have no holder';
    end if;
    insert into public.handover_forms (form_date, purpose, employee_id, return_condition, data_backed_up, remarks)
    values (rdate, 'return', holder, p_return_condition, p_data_backed_up, nullif(btrim(p_remarks), ''))
    returning * into form;
  end if;

  moves_prev := public._allow_asset_moves();

  for item in select * from jsonb_array_elements(p_items) loop
    select * into a from public.assets where id = (item ->> 'asset_id')::uuid;
    nstatus := coalesce(item ->> 'next_status', 'spare');
    if nstatus not in ('spare', 'under_repair', 'faulty') then
      raise exception 'After a return the status must be Spare, Under Repair or Faulty, not %', nstatus;
    end if;

    returned := public._smallint_array(item -> 'accessories_returned');
    missing  := public._smallint_array(item -> 'accessories_missing');
    select coalesce(array_agg(accessory_type_id), '{}') into current_acc
    from public.asset_accessories where asset_id = a.id;
    if not (returned || missing) <@ current_acc then
      raise exception '% was not issued with all of those accessories', a.asset_tag;
    end if;

    -- Stock-linked accessories go back to stock; missing ones are gone.
    delete from public.asset_accessories aa
    using public.accessory_types t
    where aa.asset_id = a.id and t.id = aa.accessory_type_id
      and (aa.accessory_type_id = any (missing)
           or (aa.accessory_type_id = any (returned) and t.stock_item_id is not null));
    -- Phase 2: stock. Add 1 back for each returned accessory linked to a stock item.

    update public.assets set
      status = nstatus,
      assigned_employee_id = null,
      department_id = null,
      location_id = loc,
      date_assigned = null,
      condition = coalesce(item ->> 'condition', a.condition)
    where id = a.id;

    reason := nullif(concat_ws(' | ', nullif(btrim(p_remarks), ''),
                               'Fault: ' || nullif(btrim(item ->> 'fault_description'), '')), '');

    insert into public.change_log (
      change_date, asset_id, change_type, from_employee_id, from_location_id, to_location_id,
      condition, accessories, accessories_missing, reason, handover_form_id)
    values (
      rdate, a.id, 'returned', a.assigned_employee_id, a.location_id, loc,
      coalesce(item ->> 'condition', a.condition), public._accessory_names(returned),
      public._accessory_names(missing), reason, form.id);
  end loop;

  perform public._restore_asset_moves(moves_prev);
  return form.form_no;
end;
$$;

-- ---------------------------------------------------------------------------
-- transfer_assets: from one person to another. Department and location follow the new
-- person (location stays put if they have no desk). Accessories go with the asset.
-- ---------------------------------------------------------------------------
create or replace function public.transfer_assets(
  p_from_employee_id uuid,
  p_to_employee_id   uuid,
  p_asset_ids        uuid[],
  p_make_form        boolean default false,
  p_transfer_date    date default null,
  p_reason           text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  moves_prev text;
  src    public.employees;
  dst    public.employees;
  a      public.assets;
  tdate  date := coalesce(p_transfer_date, current_date);
  form   public.handover_forms;
begin
  perform public._require_admin();

  select * into src from public.employees where id = p_from_employee_id;
  if not found then raise exception 'Unknown employee (from)'; end if;
  select * into dst from public.employees where id = p_to_employee_id;
  if not found then raise exception 'Unknown employee (to)'; end if;
  if src.id = dst.id then raise exception 'Pick two different people'; end if;
  if dst.status <> 'active' then raise exception '% has left', dst.full_name; end if;
  if coalesce(cardinality(p_asset_ids), 0) = 0 then raise exception 'Pick at least one asset'; end if;

  if p_make_form then
    insert into public.handover_forms (form_date, purpose, employee_id, from_employee_id, remarks)
    values (tdate, 'transfer', dst.id, src.id, nullif(btrim(p_reason), ''))
    returning * into form;
  end if;

  moves_prev := public._allow_asset_moves();

  for a in select * from public.assets where id = any (p_asset_ids) order by asset_tag for update loop
    if a.status <> 'in_use' or a.assigned_employee_id is distinct from src.id then
      raise exception '% is not held by %', a.asset_tag, src.full_name;
    end if;

    update public.assets set
      assigned_employee_id = dst.id,
      department_id = dst.department_id,
      location_id = coalesce(dst.default_location_id, a.location_id),
      date_assigned = tdate
    where id = a.id;

    insert into public.change_log (
      change_date, asset_id, change_type, from_employee_id, to_employee_id,
      from_location_id, to_location_id, condition, accessories, reason, handover_form_id)
    values (
      tdate, a.id, 'reassigned', src.id, dst.id, a.location_id,
      coalesce(dst.default_location_id, a.location_id), a.condition,
      (select public._accessory_names(array_agg(accessory_type_id))
       from public.asset_accessories where asset_id = a.id),
      nullif(btrim(p_reason), ''), form.id);
  end loop;

  if (select count(*) from public.assets where id = any (p_asset_ids)) <> cardinality(p_asset_ids) then
    raise exception 'One or more assets were not found';
  end if;

  perform public._restore_asset_moves(moves_prev);
  return form.form_no;
end;
$$;

-- ---------------------------------------------------------------------------
-- move_asset: change where an asset sits and whom it serves (null department = Common).
-- ---------------------------------------------------------------------------
create or replace function public.move_asset(
  p_asset_id      uuid,
  p_location_id   smallint,
  p_department_id smallint,
  p_reason        text default null,
  p_move_date     date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  moves_prev text;
  a public.assets;
begin
  perform public._require_admin();

  select * into a from public.assets where id = p_asset_id for update;
  if not found then raise exception 'Unknown asset'; end if;
  if a.status in ('retired', 'disposed') then
    raise exception '% is %, so it cannot be moved', a.asset_tag, a.status;
  end if;
  if a.location_id is not distinct from p_location_id
     and a.department_id is not distinct from p_department_id then
    raise exception 'Nothing to change: % is already there', a.asset_tag;
  end if;

  moves_prev := public._allow_asset_moves();

  update public.assets set location_id = p_location_id, department_id = p_department_id
  where id = a.id;

  insert into public.change_log (
    change_date, asset_id, change_type, from_location_id, to_location_id, from_text, to_text, reason)
  values (
    coalesce(p_move_date, current_date), a.id, 'location_changed', a.location_id, p_location_id,
    coalesce((select name from public.departments where id = a.department_id), 'Common'),
    coalesce((select name from public.departments where id = p_department_id), 'Common'),
    nullif(btrim(p_reason), ''));

  perform public._restore_asset_moves(moves_prev);
end;
$$;

-- ---------------------------------------------------------------------------
-- retire_asset / dispose_asset: end of life. Clears the person. Dispose works from any
-- state except Disposed; Retire from any active state.
-- ---------------------------------------------------------------------------
create or replace function public._end_of_life(p_asset_id uuid, p_to text, p_reason text, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  moves_prev text;
  a public.assets;
begin
  perform public._require_admin();

  select * into a from public.assets where id = p_asset_id for update;
  if not found then raise exception 'Unknown asset'; end if;
  if a.status = 'disposed' or (p_to = 'retired' and a.status = 'retired') then
    raise exception '% is already %', a.asset_tag, a.status;
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Give a reason';
  end if;

  moves_prev := public._allow_asset_moves();

  update public.assets set status = p_to, assigned_employee_id = null, date_assigned = null
  where id = a.id;

  insert into public.change_log (
    change_date, asset_id, change_type, from_employee_id, from_location_id, to_location_id,
    condition, reason)
  values (
    coalesce(p_date, current_date), a.id, p_to, a.assigned_employee_id, a.location_id,
    a.location_id, a.condition, btrim(p_reason));

  perform public._restore_asset_moves(moves_prev);
end;
$$;

create or replace function public.retire_asset(p_asset_id uuid, p_reason text, p_date date default null)
returns void
language sql
security definer
set search_path = public
as $$
  select public._end_of_life(p_asset_id, 'retired', p_reason, p_date);
$$;

create or replace function public.dispose_asset(p_asset_id uuid, p_reason text, p_date date default null)
returns void
language sql
security definer
set search_path = public
as $$
  select public._end_of_life(p_asset_id, 'disposed', p_reason, p_date);
$$;

-- ---------------------------------------------------------------------------
-- Who may call what. Internal helpers: nobody but these functions. Actions: authenticated
-- (viewers then get 'not allowed' from _require_admin). Nothing here is for anon.
-- ---------------------------------------------------------------------------
revoke all on function
  public._require_admin(), public._allow_asset_moves(), public._restore_asset_moves(text),
  public._it_store_id(),
  public._accessory_names(smallint[]), public._smallint_array(jsonb),
  public._end_of_life(uuid, text, text, date)
from public, anon, authenticated;

grant execute on function
  public.next_asset_tag(smallint),
  public.add_assets(smallint, int, jsonb, text[]),
  public.issue_assets(uuid, jsonb, smallint, date, text, boolean),
  public.return_assets(jsonb, text, text, text, boolean, date, smallint),
  public.transfer_assets(uuid, uuid, uuid[], boolean, date, text),
  public.move_asset(uuid, smallint, smallint, text, date),
  public.retire_asset(uuid, text, date),
  public.dispose_asset(uuid, text, date)
to authenticated;
