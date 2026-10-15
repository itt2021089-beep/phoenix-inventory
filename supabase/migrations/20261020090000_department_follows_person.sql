-- An asset held by someone serves that person's department, and admin can correct an asset's
-- status, department and accessories (Sahan, 15/10/2026).
--
-- Found on PROD after the first import: an asset copied its holder's department only at issue
-- or transfer, so changing a person's department later left their laptop and headset behind
-- (people imported without a department showed their assets as Common, even after Sahan set
-- the person's department). Location / desk is also dropped from the screens: department is
-- enough. Its columns stay (nothing is deleted); no screen reads or writes them any more.
--
-- Every change below writes a Change Log row, so the log and the asset still never disagree
-- (CLAUDE.md rule 5). Three new Change Log types: Department Changed, Status Changed,
-- Accessories Changed.

alter table public.change_log drop constraint change_log_change_type_check;
alter table public.change_log add constraint change_log_change_type_check check (change_type in (
  'received_new', 'issued', 'returned', 'reassigned', 'location_changed', 'sent_for_repair',
  'back_from_repair', 'upgraded', 'part_replaced', 'os_reinstalled', 'retired', 'disposed',
  'department_changed', 'status_changed', 'accessories_changed'));

/** The status labels Sahan uses (src/lib/constants.ts), for the Change Log's from / to text. */
create or replace function public._status_label(p_status text)
returns text
language sql
immutable
as $$
  select case p_status
    when 'in_use' then 'In Use' when 'spare' then 'Spare' when 'under_repair' then 'Under Repair'
    when 'faulty' then 'Faulty' when 'lost_stolen' then 'Lost / Stolen'
    when 'retired' then 'Retired' when 'disposed' then 'Disposed' else p_status end
$$;

create or replace function public._department_name(p_id smallint)
returns text
language sql
stable
set search_path = public
as $$ select coalesce((select name from public.departments where id = p_id), 'Common') $$;

revoke all on function public._status_label(text), public._department_name(smallint)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Department follows the person. Only admin can update employees (RLS), so this needs no
-- check of its own; it is security definer because nobody may write the Change Log directly.
-- ---------------------------------------------------------------------------
create or replace function public.employees_department_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  moves_prev text;
begin
  if new.department_id is not distinct from old.department_id then
    return new;
  end if;
  moves_prev := public._allow_asset_moves();

  insert into public.change_log (asset_id, change_type, to_employee_id, from_text, to_text, reason)
  select a.id, 'department_changed', new.id, public._department_name(a.department_id),
         public._department_name(new.department_id),
         'Follows ' || new.full_name || ' to ' || public._department_name(new.department_id)
  from public.assets a
  where a.assigned_employee_id = new.id
    and a.department_id is distinct from new.department_id;

  update public.assets set department_id = new.department_id
  where assigned_employee_id = new.id and department_id is distinct from new.department_id;

  perform public._restore_asset_moves(moves_prev);
  return new;
end;
$$;

revoke all on function public.employees_department_follow() from public, anon, authenticated;

create trigger employees_department_follow after update of department_id on public.employees
  for each row execute function public.employees_department_follow();

-- ---------------------------------------------------------------------------
-- change_asset_status: correct a status that no other action sets (Lost / Stolen) or that came
-- in wrong. A reason is required. Taking an item back from someone stays with Return (it moves
-- accessories and stock and can make a handover form); Retire and Dispose keep their own actions.
-- ---------------------------------------------------------------------------
create or replace function public.change_asset_status(
  p_asset_id uuid,
  p_status   text,
  p_reason   text,
  p_date     date default null
)
returns void
language plpgsql
security definer
set search_path = public
set timezone = 'Asia/Colombo'
as $$
declare
  moves_prev text;
  a public.assets;
begin
  perform public._require_admin();
  if p_status is null or p_status not in ('in_use', 'spare', 'faulty', 'under_repair', 'lost_stolen') then
    raise exception 'Use Retire or Dispose for that status';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Say why the status is changing';
  end if;

  select * into a from public.assets where id = p_asset_id for update;
  if not found then raise exception 'Unknown asset'; end if;
  if a.status in ('retired', 'disposed') then
    raise exception '% is %, so its status cannot be changed', a.asset_tag, public._status_label(a.status);
  end if;
  if a.status = p_status then
    raise exception 'Nothing to change: % is already %', a.asset_tag, public._status_label(p_status);
  end if;
  if p_status = 'spare' and a.assigned_employee_id is not null then
    raise exception '% is with someone: use Return to take it back', a.asset_tag;
  end if;

  moves_prev := public._allow_asset_moves();
  update public.assets set status = p_status where id = a.id;
  insert into public.change_log (change_date, asset_id, change_type, from_text, to_text, reason)
  values (coalesce(p_date, current_date), a.id, 'status_changed', public._status_label(a.status),
          public._status_label(p_status), btrim(p_reason));
  perform public._restore_asset_moves(moves_prev);
end;
$$;

-- ---------------------------------------------------------------------------
-- change_asset_department: for items nobody holds (a shared printer, an AC). An item someone
-- holds follows that person's department instead.
-- ---------------------------------------------------------------------------
create or replace function public.change_asset_department(
  p_asset_id      uuid,
  p_department_id smallint,
  p_reason        text default null,
  p_date          date default null
)
returns void
language plpgsql
security definer
set search_path = public
set timezone = 'Asia/Colombo'
as $$
declare
  moves_prev text;
  a public.assets;
begin
  perform public._require_admin();
  select * into a from public.assets where id = p_asset_id for update;
  if not found then raise exception 'Unknown asset'; end if;
  if a.status in ('retired', 'disposed') then
    raise exception '% is %, so its department cannot be changed', a.asset_tag, public._status_label(a.status);
  end if;
  if a.assigned_employee_id is not null then
    raise exception '% follows its holder''s department: change the person''s department instead', a.asset_tag;
  end if;
  if p_department_id is not null and not exists (select 1 from public.departments where id = p_department_id) then
    raise exception 'Unknown department';
  end if;
  if a.department_id is not distinct from p_department_id then
    raise exception 'Nothing to change: % is already %', a.asset_tag, public._department_name(p_department_id);
  end if;

  moves_prev := public._allow_asset_moves();
  update public.assets set department_id = p_department_id where id = a.id;
  insert into public.change_log (change_date, asset_id, change_type, from_text, to_text, reason)
  values (coalesce(p_date, current_date), a.id, 'department_changed',
          public._department_name(a.department_id), public._department_name(p_department_id),
          nullif(btrim(coalesce(p_reason, '')), ''));
  perform public._restore_asset_moves(moves_prev);
end;
$$;

-- ---------------------------------------------------------------------------
-- set_asset_accessories: correct which accessories are with an item (for example ones the
-- workbook import got wrong). A correction, not a hand-over: no stock moves (use Stock -> Adjust
-- if the count is wrong too). Writes an Accessories Changed row when anything changes.
-- ---------------------------------------------------------------------------
create or replace function public.set_asset_accessories(
  p_asset_id           uuid,
  p_accessory_type_ids smallint[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.assets;
  wanted smallint[] := coalesce(p_accessory_type_ids, '{}');
  before text[];
  after text[];
begin
  perform public._require_admin();
  select * into a from public.assets where id = p_asset_id for update;
  if not found then raise exception 'Unknown asset'; end if;
  if a.status in ('retired', 'disposed') then
    raise exception '% is %, so its accessories cannot be changed', a.asset_tag, public._status_label(a.status);
  end if;
  if exists (select 1 from unnest(wanted) w where not exists (select 1 from public.accessory_types t where t.id = w)) then
    raise exception 'Unknown accessory';
  end if;

  before := array(select t.name from public.asset_accessories x
                  join public.accessory_types t on t.id = x.accessory_type_id
                  where x.asset_id = a.id order by t.name);
  delete from public.asset_accessories
  where asset_id = a.id and accessory_type_id <> all (wanted);
  insert into public.asset_accessories (asset_id, accessory_type_id)
  select a.id, w from unnest(wanted) w
  on conflict do nothing;
  after := array(select t.name from public.asset_accessories x
                 join public.accessory_types t on t.id = x.accessory_type_id
                 where x.asset_id = a.id order by t.name);

  if before is distinct from after then
    insert into public.change_log (asset_id, change_type, from_text, to_text, accessories, reason)
    values (a.id, 'accessories_changed', nullif(array_to_string(before, ', '), ''),
            nullif(array_to_string(after, ', '), ''), after, 'Corrected (no stock movement)');
  end if;
end;
$$;

revoke all on function
  public.change_asset_status(uuid, text, text, date),
  public.change_asset_department(uuid, smallint, text, date),
  public.set_asset_accessories(uuid, smallint[])
  from public, anon;
grant execute on function
  public.change_asset_status(uuid, text, text, date),
  public.change_asset_department(uuid, smallint, text, date),
  public.set_asset_accessories(uuid, smallint[])
  to authenticated;

-- ---------------------------------------------------------------------------
-- One-time fix: every asset someone holds takes that person's department now (the imported
-- people whose assets showed as Common). One Department Changed row per asset it moves.
-- ---------------------------------------------------------------------------
do $$
declare
  moves_prev text := public._allow_asset_moves();
begin
  insert into public.change_log (asset_id, change_type, to_employee_id, from_text, to_text, reason)
  select a.id, 'department_changed', e.id, public._department_name(a.department_id),
         public._department_name(e.department_id),
         'Matched to ' || e.full_name || '''s department (one-time fix, 15/10/2026)'
  from public.assets a
  join public.employees e on e.id = a.assigned_employee_id
  where a.department_id is distinct from e.department_id;

  update public.assets a set department_id = e.department_id
  from public.employees e
  where e.id = a.assigned_employee_id and a.department_id is distinct from e.department_id;

  perform public._restore_asset_moves(moves_prev);
end;
$$;
