-- Fixes from the audit of 15/10/2026 (docs/AUDIT.md: H2, M1, M2).
--
-- H2: Change status allowed a held item to become Faulty or Under Repair and kept the holder;
--     Send for repair kept it too, so Back from repair as Spare broke the "a Spare item has no
--     holder" rule with a raw database error. Taking an item back from someone is Return's job
--     (it handles accessories, stock and the handover form), so:
--       - change_asset_status refuses Spare, Faulty and Under Repair while someone holds it;
--       - send_for_repair refuses an item someone still holds;
--       - back_from_repair clears any holder when the item comes back Spare (for an item that
--         reached Under Repair with a holder before this fix).
-- M1: a Lost / Stolen item kept its holder, Return refused it (not In Use), and a person
--     holding anything cannot be marked Left, so the leaver was stuck. Marking an item Lost /
--     Stolen now clears the holder; who had it stays on the Change Log row (from_employee_id),
--     like Retire and Dispose. Items already Lost / Stolen with a holder are cleared the same way.
-- M2: a logged-out phone could upload any number of photos to reports/. Uploads are now capped
--     per hour at the same number as QR reports (setting report_rate_limit_total, 20), checked
--     by a function in a schema the API does not publish.

-- ---------------------------------------------------------------------------
-- H2 + M1: change_asset_status
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
  holder_name text;
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
  if a.assigned_employee_id is not null and p_status in ('spare', 'faulty', 'under_repair') then
    select full_name into holder_name from public.employees where id = a.assigned_employee_id;
    raise exception '% is with %: use Return to take it back (Return can mark it Faulty or Under Repair)',
      a.asset_tag, holder_name;
  end if;

  moves_prev := public._allow_asset_moves();
  if p_status = 'lost_stolen' then
    -- Nobody holds a lost item; the Change Log row keeps who had it.
    update public.assets set status = p_status, assigned_employee_id = null, date_assigned = null
    where id = a.id;
  else
    update public.assets set status = p_status where id = a.id;
  end if;
  insert into public.change_log (change_date, asset_id, change_type, from_employee_id, from_text, to_text, reason)
  values (coalesce(p_date, current_date), a.id, 'status_changed',
          case when p_status = 'lost_stolen' then a.assigned_employee_id end,
          public._status_label(a.status), public._status_label(p_status), btrim(p_reason));
  perform public._restore_asset_moves(moves_prev);
end;
$$;

-- ---------------------------------------------------------------------------
-- H2: send_for_repair refuses an item someone still holds (it used to check only In Use).
-- Unchanged otherwise from migration faults_and_service (+ the Colombo timezone).
-- ---------------------------------------------------------------------------
create or replace function public.send_for_repair(
  p_asset_id  uuid,
  p_fault_id  bigint default null,
  p_vendor_id bigint default null,
  p_date      date default null,
  p_reason    text default null
)
returns void
language plpgsql
security definer
set search_path = public
set timezone = 'Asia/Colombo'
as $$
declare
  a          public.assets;
  vendor     text;
  moves_prev text;
begin
  perform public._require_admin();

  select * into a from public.assets where id = p_asset_id for update;
  if not found then raise exception 'Unknown asset'; end if;
  if a.status = 'in_use' or a.assigned_employee_id is not null then
    raise exception '% is with someone. Return it first (as Faulty), then send it for repair', a.asset_tag;
  end if;
  if a.status not in ('faulty', 'spare') then
    raise exception '% is %, so it cannot be sent for repair', a.asset_tag, a.status;
  end if;
  select name into vendor from public.vendors where id = p_vendor_id;

  if p_fault_id is not null then
    update public.fault_log
    set status = 'with_vendor', vendor_id = coalesce(p_vendor_id, vendor_id)
    where id = p_fault_id and asset_id = a.id and status <> 'closed';
    if not found then raise exception 'That fault is not an open fault on %', a.asset_tag; end if;
  end if;

  moves_prev := public._allow_asset_moves();
  update public.assets set status = 'under_repair' where id = a.id;
  insert into public.change_log (change_date, asset_id, change_type, from_location_id, to_text, condition, reason)
  values (coalesce(p_date, current_date), a.id, 'sent_for_repair', a.location_id, vendor, a.condition,
          nullif(btrim(p_reason), ''));
  perform public._restore_asset_moves(moves_prev);
end;
$$;

-- ---------------------------------------------------------------------------
-- H2: back_from_repair clears any holder when the item comes back Spare.
-- ---------------------------------------------------------------------------
create or replace function public.back_from_repair(
  p_asset_id    uuid,
  p_condition   text,
  p_next_status text default 'spare',
  p_date        date default null,
  p_reason      text default null
)
returns void
language plpgsql
security definer
set search_path = public
set timezone = 'Asia/Colombo'
as $$
declare
  a          public.assets;
  vendor     text;
  d          date := coalesce(p_date, current_date);
  moves_prev text;
begin
  perform public._require_admin();

  select * into a from public.assets where id = p_asset_id for update;
  if not found then raise exception 'Unknown asset'; end if;
  if a.status <> 'under_repair' then
    raise exception '% is not Under Repair (it is %)', a.asset_tag, a.status;
  end if;
  if p_next_status not in ('spare', 'faulty') then
    raise exception 'Back from repair goes to Spare (fixed) or Faulty (not fixed), not %', p_next_status;
  end if;

  select to_text into vendor from public.change_log
  where asset_id = a.id and change_type = 'sent_for_repair'
  order by change_date desc, id desc limit 1;

  if p_next_status = 'spare' then
    update public.fault_log set status = 'closed', date_closed = d
    where asset_id = a.id and status = 'with_vendor';
  else
    update public.fault_log set status = 'open'
    where asset_id = a.id and status = 'with_vendor';
  end if;

  moves_prev := public._allow_asset_moves();
  update public.assets set
    status = p_next_status,
    condition = coalesce(p_condition, condition),
    -- A Spare item has no holder (and so no holder's department).
    assigned_employee_id = case when p_next_status = 'spare' then null else assigned_employee_id end,
    department_id = case when p_next_status = 'spare' and assigned_employee_id is not null
                         then null else department_id end,
    date_assigned = case when p_next_status = 'spare' then null else date_assigned end
  where id = a.id;
  insert into public.change_log (change_date, asset_id, change_type, from_employee_id, to_location_id, from_text, condition, reason)
  values (d, a.id, 'back_from_repair',
          case when p_next_status = 'spare' then a.assigned_employee_id end,
          a.location_id, vendor, coalesce(p_condition, a.condition), nullif(btrim(p_reason), ''));
  perform public._restore_asset_moves(moves_prev);
end;
$$;

-- ---------------------------------------------------------------------------
-- M1: items already Lost / Stolen with a holder: clear it, keeping who had it on the log.
-- ---------------------------------------------------------------------------
do $$
declare
  moves_prev text := public._allow_asset_moves();
begin
  insert into public.change_log (asset_id, change_type, from_employee_id, from_text, to_text, reason)
  select a.id, 'status_changed', a.assigned_employee_id, 'Lost / Stolen', 'Lost / Stolen',
         'Nobody holds a lost item now (audit fix, 15/10/2026)'
  from public.assets a
  where a.status = 'lost_stolen' and a.assigned_employee_id is not null;

  update public.assets set assigned_employee_id = null, date_assigned = null
  where status = 'lost_stolen' and assigned_employee_id is not null;

  perform public._restore_asset_moves(moves_prev);
end;
$$;

-- ---------------------------------------------------------------------------
-- M2: cap logged-out uploads to reports/. The check lives in schema `private`, which the API
-- does not publish (only public and graphql_public are), so it is not a callable endpoint.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon;

create or replace function private.report_upload_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) < greatest(public._int_setting('report_rate_limit_total', 20), 1)
  from storage.objects
  where bucket_id = 'photos' and name like 'reports/%'
    and created_at > now() - interval '1 hour'
$$;

revoke all on function private.report_upload_allowed() from public;
grant execute on function private.report_upload_allowed() to anon;

drop policy photos_bucket_anon_report on storage.objects;
create policy photos_bucket_anon_report on storage.objects for insert to anon
  with check (
    bucket_id = 'photos'
    and name ~ '^reports/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    and private.report_upload_allowed()
  );
