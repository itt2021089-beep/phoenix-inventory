-- Phase 2: Issue and Return now move stock, and Return opens a real fault.
--
-- Same names and parameters as Phase 1, so the screens do not change. What is new:
--   - Issue: each ticked accessory linked to a stock item takes 1 from stock, but only when it
--     is newly handed over. An accessory already with the asset (still with a Spare laptop)
--     already left the store once and is not counted twice.
--   - Return: each returned accessory linked to a stock item puts 1 back. A missing one
--     does not (it was counted out when it was issued).
--   - Return: "what's wrong" opens a fault (FLT-) with the person returning it as both the
--     reporter and the holder, instead of only being written into the Change Log reason.
-- Stock never goes below 0: Issue refuses, says which accessory, and saves nothing.

-- Takes one of an accessory's stock item for a change row. Refuses, by name, if there is none.
create or replace function public._accessory_stock_out(
  p_accessory_type_id smallint,
  p_change_log_id     bigint,
  p_employee_id       uuid,
  p_department_id     smallint,
  p_date              date,
  p_reference         text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  acc  public.accessory_types;
  item public.stock_items;
begin
  select * into acc from public.accessory_types where id = p_accessory_type_id;
  if acc.stock_item_id is null then return; end if;
  select * into item from public.stock_items where id = acc.stock_item_id;
  if item.qty_on_hand < 1 then
    raise exception '% stock is %. Untick %, or receive stock first.', item.name, item.qty_on_hand, acc.name
      using errcode = 'check_violation';
  end if;
  insert into public.stock_movements (
    stock_item_id, movement_date, movement_type, qty_change, employee_id, department_id,
    change_log_id, reference)
  values (item.id, p_date, 'issued', -1, p_employee_id, p_department_id, p_change_log_id, p_reference);
end;
$$;

create or replace function public._accessory_stock_back(
  p_accessory_type_id smallint,
  p_change_log_id     bigint,
  p_employee_id       uuid,
  p_date              date,
  p_reference         text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  stock_id bigint;
begin
  select stock_item_id into stock_id from public.accessory_types where id = p_accessory_type_id;
  if stock_id is null then return; end if;
  insert into public.stock_movements (
    stock_item_id, movement_date, movement_type, qty_change, employee_id, change_log_id, reference)
  values (stock_id, p_date, 'returned', 1, p_employee_id, p_change_log_id, p_reference);
end;
$$;

revoke all on function
  public._accessory_stock_out(smallint, bigint, uuid, smallint, date, text),
  public._accessory_stock_back(smallint, bigint, uuid, date, text)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- issue_assets
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
  had_ids  smallint[];
  acc      smallint;
  loc      smallint;
  idate    date := coalesce(p_issue_date, current_date);
  form     public.handover_forms;
  chg_id   bigint;
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
    select coalesce(array_agg(accessory_type_id), '{}') into had_ids
    from public.asset_accessories where asset_id = a.id;

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

    insert into public.change_log (
      change_date, asset_id, change_type, to_employee_id, from_location_id, to_location_id,
      condition, accessories, reason, handover_form_id)
    values (
      idate, a.id, 'issued', emp.id, a.location_id, loc,
      coalesce(item ->> 'condition', a.condition), public._accessory_names(acc_ids),
      nullif(btrim(p_reason), ''), form.id)
    returning id into chg_id;

    -- Stock: only what is newly handed over with this asset.
    foreach acc in array acc_ids loop
      if not acc = any (had_ids) then
        perform public._accessory_stock_out(acc, chg_id, emp.id, emp.department_id, idate,
                                            'Issued with ' || a.asset_tag);
      end if;
    end loop;
  end loop;

  perform public._restore_asset_moves(moves_prev);
  return form.form_no;
end;
$$;

-- ---------------------------------------------------------------------------
-- return_assets
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
  moves_prev  text;
  a           public.assets;
  item        jsonb;
  holder      uuid;
  first       boolean := true;
  returned    smallint[];
  missing     smallint[];
  current_acc smallint[];
  acc         smallint;
  nstatus     text;
  loc         smallint := coalesce(p_location_id, public._it_store_id());
  rdate       date := coalesce(p_return_date, current_date);
  reason      text;
  fault_text  text;
  fault_no    text;
  form        public.handover_forms;
  chg_id      bigint;
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

    -- A fault, opened while the asset still shows who held it.
    fault_text := nullif(btrim(item ->> 'fault_description'), '');
    fault_no := null;
    if fault_text is not null then
      insert into public.fault_log (
        asset_id, date_reported, reported_by_employee_id, holder_employee_id, description)
      values (a.id, rdate, a.assigned_employee_id, a.assigned_employee_id, fault_text)
      returning fault_log.fault_no into fault_no;
    end if;

    -- Stock-linked accessories go back to stock; missing ones are gone.
    delete from public.asset_accessories aa
    using public.accessory_types t
    where aa.asset_id = a.id and t.id = aa.accessory_type_id
      and (aa.accessory_type_id = any (missing)
           or (aa.accessory_type_id = any (returned) and t.stock_item_id is not null));

    update public.assets set
      status = nstatus,
      assigned_employee_id = null,
      department_id = null,
      location_id = loc,
      date_assigned = null,
      condition = coalesce(item ->> 'condition', a.condition)
    where id = a.id;

    reason := nullif(concat_ws(' | ', nullif(btrim(p_remarks), ''),
                               case when fault_no is not null then fault_no || ': ' || fault_text end), '');

    insert into public.change_log (
      change_date, asset_id, change_type, from_employee_id, from_location_id, to_location_id,
      condition, accessories, accessories_missing, reason, handover_form_id)
    values (
      rdate, a.id, 'returned', a.assigned_employee_id, a.location_id, loc,
      coalesce(item ->> 'condition', a.condition), public._accessory_names(returned),
      public._accessory_names(missing), reason, form.id)
    returning id into chg_id;

    foreach acc in array returned loop
      perform public._accessory_stock_back(acc, chg_id, a.assigned_employee_id, rdate,
                                           'Returned with ' || a.asset_tag);
    end loop;
  end loop;

  perform public._restore_asset_moves(moves_prev);
  return form.form_no;
end;
$$;
