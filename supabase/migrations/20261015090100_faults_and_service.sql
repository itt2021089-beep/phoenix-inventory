-- Phase 2: faults and service jobs (docs/SCHEMA.md -> fault_log, service_jobs, service_lines).
--
-- Rules enforced here:
--   - "Who broke it" is three facts (CLAUDE.md, rule 8): who reported it, who held it then
--     (filled in from the asset automatically), and Sahan's finding (cause + responsible).
--   - Each cost lives in one place (rule 7): a fault fixed inside a service job carries cost 0,
--     and the cost sits on the service line.
--   - Work on existing assets is a service job with one line per asset (rule 6); each line gets
--     its next due date from the category's service interval unless one is given.
-- Service lines are created before fault_log so the fault can point at one.

create sequence public.fault_no_seq;
create sequence public.service_no_seq;

-- ---------------------------------------------------------------------------
-- service_jobs, service_lines
-- ---------------------------------------------------------------------------
create table public.service_jobs (
  id             bigint generated always as identity primary key,
  job_no         text not null unique
                 default 'SRV-' || lpad(nextval('public.service_no_seq')::text, 4, '0'),
  vendor_id      bigint references public.vendors (id),
  job_type       text not null check (job_type in
                 ('cleaning', 'repair', 'service', 'inspection', 'installation')),
  service_date   date not null default current_date,
  invoice_no     text,
  invoice_total  numeric(12,2) check (invoice_total >= 0),
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid()
);

create table public.service_lines (
  id             bigint generated always as identity primary key,
  job_id         bigint not null references public.service_jobs (id) on delete cascade,
  asset_id       uuid   not null references public.assets (id),
  work_done      text   not null check (btrim(work_done) <> ''),
  cost           numeric(12,2) not null default 0 check (cost >= 0),
  next_due_date  date,
  notes          text
);

create index service_lines_job on public.service_lines (job_id);
create index service_lines_asset on public.service_lines (asset_id);

-- Next due date: service date + the category's interval, unless one was given.
create or replace function public.service_lines_next_due()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.next_due_date is null then
    select j.service_date + c.service_interval_days
    into new.next_due_date
    from public.service_jobs j, public.assets a
    join public.categories c on c.id = a.category_id
    where j.id = new.job_id and a.id = new.asset_id and c.service_interval_days is not null;
  end if;
  return new;
end;
$$;

create trigger service_lines_next_due before insert or update on public.service_lines
  for each row execute function public.service_lines_next_due();

-- ---------------------------------------------------------------------------
-- fault_log
-- ---------------------------------------------------------------------------
create table public.fault_log (
  id                       bigint generated always as identity primary key,
  fault_no                 text not null unique
                           default 'FLT-' || lpad(nextval('public.fault_no_seq')::text, 4, '0'),
  asset_id                 uuid not null references public.assets (id),
  date_reported            date not null default current_date,
  source                   text not null default 'admin' check (source in ('admin', 'qr')),
  reported_by_employee_id  uuid references public.employees (id),
  reported_by_name         text,
  holder_employee_id       uuid references public.employees (id),
  description              text not null check (btrim(description) <> ''),
  status                   text not null default 'open'
                           check (status in ('open', 'in_progress', 'with_vendor', 'closed')),
  action_taken             text,
  vendor_id                bigint references public.vendors (id),
  cost                     numeric(12,2) not null default 0 check (cost >= 0),
  under_warranty           boolean not null default false,
  service_line_id          bigint references public.service_lines (id),
  date_closed              date,
  cause                    text check (cause in
                           ('wear_and_tear', 'accident', 'misuse', 'power_issue',
                            'manufacturing_defect', 'unknown')),
  responsible_employee_id  uuid references public.employees (id),
  finding_notes            text,
  remarks                  text,
  created_at               timestamptz not null default now(),
  created_by               uuid default auth.uid(),
  updated_at               timestamptz,
  constraint fault_closed_has_date check (status <> 'closed' or date_closed is not null),
  -- Rule 7: fixed inside a service job means the cost is on the service line, not here.
  constraint fault_service_line_costs_nothing check (service_line_id is null or cost = 0)
);

create index fault_log_asset on public.fault_log (asset_id, date_reported desc);
create index fault_log_open on public.fault_log (status) where status <> 'closed';

create or replace function public.fault_log_fill()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Who held it when it was reported: from the asset, unless the caller already knows.
  if tg_op = 'INSERT' and new.holder_employee_id is null then
    select assigned_employee_id into new.holder_employee_id
    from public.assets where id = new.asset_id;
  end if;
  -- Linking a fault to a service line forces its cost to 0 (the line carries the cost).
  if new.service_line_id is not null then
    new.cost := 0;
    if new.service_line_id is distinct from (case when tg_op = 'UPDATE' then old.service_line_id end)
       and not exists (select 1 from public.service_lines
                       where id = new.service_line_id and asset_id = new.asset_id) then
      raise exception 'That service line is for a different asset';
    end if;
  end if;
  -- Closing without a date means today.
  if new.status = 'closed' and new.date_closed is null then
    new.date_closed := current_date;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger fault_log_fill before insert or update on public.fault_log
  for each row execute function public.fault_log_fill();

-- Audit trail, as for the Phase 1 tables (docs/SCHEMA.md -> audit_log).
create trigger fault_log_audit after insert or update or delete on public.fault_log
  for each row execute function public.write_audit_log();
create trigger service_jobs_audit after insert or update or delete on public.service_jobs
  for each row execute function public.write_audit_log();
create trigger service_lines_audit after insert or update or delete on public.service_lines
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- Grants and RLS: viewers read; admin adds and edits; nobody deletes.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['fault_log', 'service_jobs', 'service_lines'] loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_viewer_or_admin())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_update', t);
  end loop;
end;
$$;

revoke all on sequence public.fault_no_seq, public.service_no_seq from anon, authenticated;
-- Admin adds faults directly, so the FLT number's default needs the sequence.
grant usage on sequence public.fault_no_seq, public.service_no_seq to authenticated;

-- ---------------------------------------------------------------------------
-- record_service_job(header, lines): one job, one line per asset. Returns the SRV number.
-- header: {vendor_id, job_type, service_date, invoice_no, invoice_total, notes}
-- lines:  [{asset_id, work_done, cost, next_due_date?, notes?, fault_id?}]
-- A line with a fault_id links that fault to it, which sets the fault's cost to 0.
-- ---------------------------------------------------------------------------
create or replace function public.record_service_job(p_header jsonb, p_lines jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  job   public.service_jobs;
  line  jsonb;
  a     public.assets;
  new_line_id bigint;
begin
  perform public._require_admin();

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one asset to the job';
  end if;

  insert into public.service_jobs (vendor_id, job_type, service_date, invoice_no, invoice_total, notes)
  values (
    (p_header ->> 'vendor_id')::bigint,
    coalesce(p_header ->> 'job_type', 'service'),
    coalesce((p_header ->> 'service_date')::date, current_date),
    nullif(btrim(p_header ->> 'invoice_no'), ''),
    (p_header ->> 'invoice_total')::numeric,
    nullif(btrim(p_header ->> 'notes'), ''))
  returning * into job;

  for line in select * from jsonb_array_elements(p_lines) loop
    select * into a from public.assets where id = (line ->> 'asset_id')::uuid;
    if not found then raise exception 'Unknown asset %', line ->> 'asset_id'; end if;
    if a.status in ('retired', 'disposed') then
      raise exception '% is %, so it cannot be serviced', a.asset_tag, a.status;
    end if;

    insert into public.service_lines (job_id, asset_id, work_done, cost, next_due_date, notes)
    values (
      job.id, a.id, line ->> 'work_done', coalesce((line ->> 'cost')::numeric, 0),
      (line ->> 'next_due_date')::date, nullif(btrim(line ->> 'notes'), ''))
    returning id into new_line_id;

    if line ? 'fault_id' and line ->> 'fault_id' is not null then
      update public.fault_log
      set service_line_id = new_line_id, status = 'closed',
          date_closed = coalesce(date_closed, job.service_date)
      where id = (line ->> 'fault_id')::bigint and asset_id = a.id;
      if not found then
        raise exception 'Fault % is not on %', line ->> 'fault_id', a.asset_tag;
      end if;
    end if;
  end loop;

  return job.job_no;
end;
$$;

-- ---------------------------------------------------------------------------
-- send_for_repair: Faulty (or Spare) -> Under Repair, with the vendor; the fault goes
-- With Vendor. Something In Use is returned first, so its person is recorded.
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
as $$
declare
  a          public.assets;
  vendor     text;
  moves_prev text;
begin
  perform public._require_admin();

  select * into a from public.assets where id = p_asset_id for update;
  if not found then raise exception 'Unknown asset'; end if;
  if a.status = 'in_use' then
    raise exception '% is In Use. Return it first (as Faulty), then send it for repair', a.asset_tag;
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
-- back_from_repair: Under Repair -> Spare (fixed) or Faulty (not fixed). Fixed closes the
-- faults that were with the vendor; not fixed puts them back to Open.
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
  update public.assets set status = p_next_status, condition = coalesce(p_condition, condition)
  where id = a.id;
  insert into public.change_log (change_date, asset_id, change_type, to_location_id, from_text, condition, reason)
  values (d, a.id, 'back_from_repair', a.location_id, vendor, coalesce(p_condition, a.condition),
          nullif(btrim(p_reason), ''));
  perform public._restore_asset_moves(moves_prev);
end;
$$;

grant execute on function
  public.record_service_job(jsonb, jsonb),
  public.send_for_repair(uuid, bigint, bigint, date, text),
  public.back_from_repair(uuid, text, text, date, text)
to authenticated;
