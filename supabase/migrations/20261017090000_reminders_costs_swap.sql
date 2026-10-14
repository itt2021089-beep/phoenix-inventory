-- Phase 4: reminders, repair-vs-replace and the swap action (docs/SCHEMA.md -> Views, RPC).
--
-- Views are security_invoker (RLS applies through them, so logged-out callers and users with no
-- profile see nothing). Thresholds come from `settings`; business dates use Asia/Colombo.
--
-- Choices made here, so they are written down:
--   - Repair spend counts every fault cost plus every service line cost (docs/SCHEMA.md). A fault
--     fixed inside a service job carries cost 0, so a cost is never counted twice (CLAUDE.md,
--     rule 7). Routine cleaning lines count too, which matches the asset page's total.
--   - An asset with neither a purchase price nor a typical category cost has no replacement basis,
--     so it cannot be flagged on spend. Repeat faults can still flag it.
--   - A warranty is "due soon" while it still runs and ends within the window. One that has ended
--     is not a reminder. A service is "due soon" within the window and "overdue" once past.
--   - swap_asset leaves the old asset Faulty, in the IT store (the same place the Return screen
--     offers), so the existing Send for repair action takes it from there.

-- ---------------------------------------------------------------------------
-- Settings: the thresholds can now be edited in the app, so a bad value must be refused here.
-- ---------------------------------------------------------------------------
create or replace function public.settings_validate()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  hi int;
begin
  hi := case new.key
    when 'repair_replace_pct'      then 1000
    when 'repeat_fault_count'      then 100
    when 'repeat_fault_months'     then 120
    when 'reminder_window_days'    then 365
    when 'report_rate_limit'       then 1000
    when 'report_rate_limit_total' then 10000
  end;
  if hi is not null then
    if jsonb_typeof(new.value) <> 'number' or (new.value #>> '{}') !~ '^[0-9]+$'
       or (new.value #>> '{}')::numeric < 1 or (new.value #>> '{}')::numeric > hi then
      raise exception 'Setting % must be a whole number from 1 to %', new.key, hi;
    end if;
  end if;
  return new;
end;
$$;

create trigger settings_validate before insert or update on public.settings
  for each row execute function public.settings_validate();

-- ---------------------------------------------------------------------------
-- v_asset_costs: repair spend against replacement basis, and the repair-vs-replace flag.
-- ---------------------------------------------------------------------------
create view public.v_asset_costs with (security_invoker = true) as
with cfg as (
  select
    coalesce((select (value #>> '{}')::numeric from public.settings where key = 'repair_replace_pct'), 50)   as pct,
    coalesce((select (value #>> '{}')::int     from public.settings where key = 'repeat_fault_count'), 3)    as repeats,
    coalesce((select (value #>> '{}')::int     from public.settings where key = 'repeat_fault_months'), 12)  as months
),
spend as (
  select a.id as asset_id,
         coalesce((select sum(f.cost) from public.fault_log f where f.asset_id = a.id), 0)
         + coalesce((select sum(l.cost) from public.service_lines l where l.asset_id = a.id), 0) as repair_spend
  from public.assets a
),
costed as (
  select
    a.id            as asset_id,
    a.asset_tag,
    a.category_id,
    c.name          as category,
    a.make,
    a.model,
    a.status,
    s.repair_spend,
    coalesce(a.purchase_price, c.typical_replacement_cost)                         as replacement_basis,
    case when a.purchase_price is not null then 'purchase price'
         when c.typical_replacement_cost is not null then 'typical cost' end       as basis_source,
    (select count(*) from public.fault_log f
     where f.asset_id = a.id
       and f.date_reported >= (now() at time zone 'Asia/Colombo')::date
                              - (cfg.months || ' months')::interval)              as faults_recent,
    a.status not in ('retired', 'disposed')                                         as is_active
  from public.assets a
  join public.categories c on c.id = a.category_id
  join spend s on s.asset_id = a.id
  cross join cfg
)
select
  k.asset_id, k.asset_tag, k.category_id, k.category, k.make, k.model, k.status,
  k.repair_spend,
  k.replacement_basis,
  k.basis_source,
  case when k.replacement_basis > 0 then round(k.repair_spend * 100 / k.replacement_basis, 1) end as spend_pct,
  k.faults_recent::int                                                                              as faults_last_12m,
  -- coalesce: with no replacement basis the comparison is unknown, which must read as "no".
  coalesce(k.is_active and k.replacement_basis > 0
           and k.repair_spend * 100 >= cfg.pct * k.replacement_basis, false)                        as flag_spend,
  k.is_active and k.faults_recent >= cfg.repeats                                                    as flag_faults,
  coalesce(k.is_active and ((k.replacement_basis > 0 and k.repair_spend * 100 >= cfg.pct * k.replacement_basis)
                            or k.faults_recent >= cfg.repeats), false)                              as flagged,
  k.is_active and k.replacement_basis is null and k.repair_spend > 0                                as no_basis
from costed k cross join cfg;

-- ---------------------------------------------------------------------------
-- v_due_soon: warranties ending and services due within the window; services also when overdue.
-- ---------------------------------------------------------------------------
create view public.v_due_soon with (security_invoker = true) as
with cfg as (
  select
    (now() at time zone 'Asia/Colombo')::date as today,
    coalesce((select (value #>> '{}')::int from public.settings where key = 'reminder_window_days'), 30) as win
),
latest_service as (
  -- Each asset's newest service line decides its next due date.
  select distinct on (l.asset_id)
         l.asset_id, l.next_due_date, l.work_done, j.service_date, j.job_no
  from public.service_lines l
  join public.service_jobs j on j.id = l.job_id
  order by l.asset_id, j.service_date desc, l.id desc
),
due as (
  select a.id as asset_id, 'warranty'::text as kind, a.warranty_until as due_date, null::text as detail
  from public.assets a, cfg
  where a.warranty_until between cfg.today and cfg.today + cfg.win
  union all
  select a.id, 'service', ls.next_due_date, ls.job_no
  from public.assets a
  join latest_service ls on ls.asset_id = a.id
  cross join cfg
  where ls.next_due_date is not null and ls.next_due_date <= cfg.today + cfg.win
)
select
  a.id            as asset_id,
  a.asset_tag,
  c.name          as category,
  a.make,
  a.model,
  l.name          as location,
  d.kind,
  d.due_date,
  d.detail,
  d.due_date - cfg.today          as days_left,
  d.due_date < cfg.today          as overdue
from due d
join public.assets a on a.id = d.asset_id
join public.categories c on c.id = a.category_id
left join public.locations l on l.id = a.location_id
cross join cfg
where a.status not in ('retired', 'disposed');

-- ---------------------------------------------------------------------------
-- v_stock_levels and v_open_faults
-- ---------------------------------------------------------------------------
create view public.v_stock_levels with (security_invoker = true) as
select
  s.id as stock_item_id, s.item_code, s.name, s.unit, s.qty_on_hand, s.reorder_level,
  s.is_active,
  s.is_active and s.reorder_level > 0 and s.qty_on_hand <= s.reorder_level as needs_reorder
from public.stock_items s;

create view public.v_open_faults with (security_invoker = true) as
select
  f.id as fault_id,
  f.fault_no,
  a.asset_tag,
  c.name            as category,
  a.make,
  a.model,
  f.date_reported,
  f.status,
  f.source,
  f.description,
  h.full_name       as holder,
  v.name            as vendor,
  (now() at time zone 'Asia/Colombo')::date - f.date_reported as age_days
from public.fault_log f
join public.assets a on a.id = f.asset_id
join public.categories c on c.id = a.category_id
left join public.employees h on h.id = f.holder_employee_id
left join public.vendors v on v.id = f.vendor_id
where f.status <> 'closed';

-- ---------------------------------------------------------------------------
-- v_spend_monthly: repair and service spend per department per month (Reports).
-- A fault's cost belongs to the month it was closed (else reported); a service line's to the
-- month of its job. The department is the asset's department now; no department is "Common".
-- ---------------------------------------------------------------------------
create view public.v_spend_monthly with (security_invoker = true) as
select
  date_trunc('month', coalesce(f.date_closed, f.date_reported))::date as month,
  a.department_id,
  coalesce(d.name, 'Common') as department,
  'fault'::text              as source,
  f.cost                     as amount
from public.fault_log f
join public.assets a on a.id = f.asset_id
left join public.departments d on d.id = a.department_id
where f.cost > 0
union all
select
  date_trunc('month', j.service_date)::date,
  a.department_id,
  coalesce(d.name, 'Common'),
  'service'::text,
  l.cost
from public.service_lines l
join public.service_jobs j on j.id = l.job_id
join public.assets a on a.id = l.asset_id
left join public.departments d on d.id = a.department_id
where l.cost > 0;

-- ---------------------------------------------------------------------------
-- v_dashboard gains the Phase 4 counts (new columns go at the end; the old ones are unchanged).
-- ---------------------------------------------------------------------------
create or replace view public.v_dashboard with (security_invoker = true) as
select
  count(*) filter (where status not in ('retired', 'disposed'))                       as active_total,
  count(*) filter (where status = 'in_use')                                            as in_use,
  count(*) filter (where status = 'spare')                                             as spare_total,
  count(*) filter (where status in ('faulty', 'under_repair'))                         as faulty_or_repair,
  count(*) filter (where status = 'lost_stolen')                                       as lost_stolen,
  count(*) filter (where status = 'in_use' and assigned_employee_id is null
                   and location_id is null)                                            as in_use_without_holder,
  (select count(*) from public.v_category_summary where below_min)                     as categories_below_min,
  (select count(*) from public.v_open_faults)                                          as open_faults,
  (select count(*) from public.v_open_faults where source = 'qr' and status = 'open')  as open_qr_faults,
  (select count(*) from public.v_stock_levels where needs_reorder)                     as stock_to_reorder,
  (select count(*) from public.v_due_soon)                                             as due_soon,
  (select count(*) from public.v_due_soon where overdue)                               as overdue,
  (select count(*) from public.v_asset_costs where flagged)                            as flagged_assets
from public.assets
having public.is_viewer_or_admin();

revoke all on public.v_asset_costs, public.v_due_soon, public.v_stock_levels, public.v_open_faults,
              public.v_spend_monthly
from anon, authenticated;
grant select on public.v_asset_costs, public.v_due_soon, public.v_stock_levels, public.v_open_faults,
                public.v_spend_monthly
to authenticated;

-- ---------------------------------------------------------------------------
-- swap_asset(faulty, spare, fault description, date, fault id): a faulty laptop is replaced from
-- the spare pool in one step, for the same person, desk and department, with its accessories.
-- It opens a fault with the description, or, when started from a fault that is already open
-- (the fault page), links that fault instead and opens nothing new.
-- ---------------------------------------------------------------------------
create or replace function public.swap_asset(
  p_faulty_asset_id   uuid,
  p_spare_asset_id    uuid,
  p_fault_description text default null,
  p_swap_date         date default null,
  p_fault_id          bigint default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  moves_prev text;
  old_a   public.assets;
  new_a   public.assets;
  holder  public.employees;
  sdate   date := coalesce(p_swap_date, current_date);
  what    text := nullif(btrim(p_fault_description), '');
  store   smallint := public._it_store_id();
  acc_ids smallint[];
  acc_names text[];
  fault_no  text;
  fault_row public.fault_log;
begin
  perform public._require_admin();

  if p_faulty_asset_id = p_spare_asset_id then raise exception 'Pick two different assets'; end if;
  if p_fault_id is null and what is null then
    raise exception 'Say what is wrong with the faulty one';
  end if;

  -- Lock both in a fixed order, so two swaps at once cannot deadlock.
  perform 1 from public.assets
  where id in (p_faulty_asset_id, p_spare_asset_id) order by id for update;
  select * into old_a from public.assets where id = p_faulty_asset_id;
  select * into new_a from public.assets where id = p_spare_asset_id;
  if old_a.id is null or new_a.id is null then raise exception 'Unknown asset'; end if;

  if old_a.status <> 'in_use' or old_a.assigned_employee_id is null then
    raise exception '% is not held by anyone, so there is nobody to swap it for', old_a.asset_tag;
  end if;
  if new_a.status <> 'spare' then
    raise exception '% is not Spare (it is %), so it cannot be swapped in', new_a.asset_tag, new_a.status;
  end if;
  if new_a.category_id <> old_a.category_id then
    raise exception '% is not the same kind of asset as %', new_a.asset_tag, old_a.asset_tag;
  end if;
  select * into holder from public.employees where id = old_a.assigned_employee_id;

  select coalesce(array_agg(accessory_type_id), '{}') into acc_ids
  from public.asset_accessories where asset_id = old_a.id;
  acc_names := public._accessory_names(acc_ids);

  if p_fault_id is not null then
    -- An open fault on this asset, already on record: it stays as it is.
    select * into fault_row from public.fault_log
    where id = p_fault_id and asset_id = old_a.id and status <> 'closed';
    if not found then
      raise exception 'That is not an open fault on %', old_a.asset_tag;
    end if;
    fault_no := fault_row.fault_no;
    what := fault_row.description;
  else
    -- The fault, opened while the old asset still shows who held it.
    insert into public.fault_log (
      asset_id, date_reported, reported_by_employee_id, holder_employee_id, description)
    values (old_a.id, sdate, holder.id, holder.id, what)
    returning fault_log.fault_no into fault_no;
  end if;

  moves_prev := public._allow_asset_moves();

  -- The spare takes over the person, desk and department.
  update public.assets set
    status = 'in_use',
    assigned_employee_id = holder.id,
    department_id = old_a.department_id,
    location_id = old_a.location_id,
    date_assigned = sdate
  where id = new_a.id;

  -- The faulty one goes to the IT store, Faulty, ready for Send for repair. The accessories
  -- move with the person, not with the broken machine.
  update public.assets set
    status = 'faulty',
    assigned_employee_id = null,
    department_id = null,
    location_id = store,
    date_assigned = null
  where id = old_a.id;

  delete from public.asset_accessories where asset_id = new_a.id;
  update public.asset_accessories set asset_id = new_a.id where asset_id = old_a.id;

  insert into public.change_log (
    change_date, asset_id, change_type, from_employee_id, from_location_id, to_location_id,
    condition, accessories, reason)
  values (
    sdate, old_a.id, 'returned', holder.id, old_a.location_id, store, old_a.condition, '{}',
    format('Swapped for %s. %s: %s', new_a.asset_tag, fault_no, what));

  insert into public.change_log (
    change_date, asset_id, change_type, to_employee_id, from_location_id, to_location_id,
    condition, accessories, reason)
  values (
    sdate, new_a.id, 'issued', holder.id, new_a.location_id, old_a.location_id, new_a.condition,
    acc_names, format('Swapped in for %s (%s)', old_a.asset_tag, fault_no));

  perform public._restore_asset_moves(moves_prev);
  return fault_no;
end;
$$;

revoke all on function public.swap_asset(uuid, uuid, text, date, bigint) from public, anon;
grant execute on function public.swap_asset(uuid, uuid, text, date, bigint) to authenticated;
