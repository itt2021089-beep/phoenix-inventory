-- Phase 1: people, assets, the change log and the audit trail (docs/SCHEMA.md -> Tables).
--
-- The rule this file exists to enforce (CLAUDE.md, domain rule 5): the Change Log and the asset
-- can never disagree. So:
--   - nobody inserts assets directly; add_assets() does, and writes the Received row;
--   - nobody changes an asset's status, holder, location or department directly; the movement
--     RPCs do, and each writes its Change Log row. A guard trigger enforces this;
--   - change_log, handover_forms and audit_log are written only by RPCs and triggers, and never
--     updated or deleted by anyone.

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------------
create table public.employees (
  id                   uuid primary key default gen_random_uuid(),
  full_name            text not null check (btrim(full_name) <> ''),
  -- Normalised: no "NIC" prefix, no spaces, uppercase. Old format 9 digits + V/X, new 12 digits.
  nid                  text not null unique check (nid ~ '^([0-9]{12}|[0-9]{9}[VX])$'),
  department_id        smallint references public.departments (id),
  designation          text,
  contact_no           text,
  default_location_id  smallint references public.locations (id),
  status               text not null default 'active' check (status in ('active', 'left')),
  joined_on            date,
  left_on              date,
  notes                text,
  created_at           timestamptz not null default now(),
  created_by           uuid default auth.uid(),
  updated_at           timestamptz,
  constraint employees_left_needs_date check (status <> 'left' or left_on is not null)
);

create trigger employees_updated_at before update on public.employees
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- assets
-- ---------------------------------------------------------------------------
create table public.assets (
  id                    uuid primary key default gen_random_uuid(),
  asset_tag             text not null unique check (asset_tag ~ '^PBS-[A-Z]{3}-[0-9]{3,}$'),
  category_id           smallint not null references public.categories (id),
  make                  text,
  model                 text,
  serial_number         text,
  status                text not null default 'spare' check (status in
                        ('in_use', 'spare', 'under_repair', 'faulty', 'lost_stolen', 'retired', 'disposed')),
  condition             text not null default 'good' check (condition in
                        ('new', 'good', 'fair', 'poor', 'damaged')),
  assigned_employee_id  uuid references public.employees (id),
  department_id         smallint references public.departments (id),   -- null = Common
  location_id           smallint references public.locations (id),
  date_assigned         date,
  specification         text,
  custom_values         jsonb not null default '{}' check (jsonb_typeof(custom_values) = 'object'),
  accessories_note      text,
  purchase_date         date,
  purchase_price        numeric(12,2) check (purchase_price >= 0),
  supplier_id           bigint references public.vendors (id),
  invoice_no            text,
  warranty_until        date,
  label_printed_at      timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  created_by            uuid default auth.uid(),
  updated_at            timestamptz,
  updated_by            uuid,
  constraint assets_spare_has_no_holder   check (status <> 'spare' or assigned_employee_id is null),
  constraint assets_inactive_has_no_holder check (status not in ('retired', 'disposed') or assigned_employee_id is null)
);

create unique index assets_serial_ci on public.assets (upper(serial_number)) where serial_number is not null;
create index assets_category on public.assets (category_id);
create index assets_holder on public.assets (assigned_employee_id);
create index assets_status on public.assets (status);

create or replace function public.assets_set_updated()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger assets_updated before update on public.assets
  for each row execute function public.assets_set_updated();

-- The guard. Movement columns change only inside the movement RPCs, which set
-- app.via_rpc = 'on' for their own transaction (set_config(..., true)). The tag never changes.
create or replace function public.assets_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.asset_tag is distinct from old.asset_tag then
    raise exception 'An asset tag never changes (% -> %)', old.asset_tag, new.asset_tag;
  end if;

  if coalesce(current_setting('app.via_rpc', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Add assets with add_assets(), so the Change Log gets its Received row';
  end if;

  if new.status               is distinct from old.status
  or new.assigned_employee_id is distinct from old.assigned_employee_id
  or new.location_id          is distinct from old.location_id
  or new.department_id        is distinct from old.department_id then
    raise exception 'Status, holder, location and department change only through the Issue, '
                    'Return, Transfer, Move, Retire and Dispose actions';
  end if;

  return new;
end;
$$;

create trigger assets_guard before insert or update on public.assets
  for each row execute function public.assets_guard();

-- ---------------------------------------------------------------------------
-- asset_accessories: accessories currently with an asset. Written only by the RPCs.
-- ---------------------------------------------------------------------------
create table public.asset_accessories (
  asset_id           uuid     not null references public.assets (id),
  accessory_type_id  smallint not null references public.accessory_types (id),
  primary key (asset_id, accessory_type_id)
);

-- ---------------------------------------------------------------------------
-- Display-number sequences. Read through column defaults so the importer can insert the
-- existing numbers and then move a sequence past them with setval (docs/SCHEMA.md).
-- ---------------------------------------------------------------------------
create sequence public.change_no_seq;
create sequence public.handover_no_seq;

-- ---------------------------------------------------------------------------
-- handover_forms
-- ---------------------------------------------------------------------------
create table public.handover_forms (
  id                bigint generated always as identity primary key,
  form_no           text not null unique
                    default 'HO-' || lpad(nextval('public.handover_no_seq')::text, 4, '0'),
  form_date         date not null default current_date,
  purpose           text not null check (purpose in ('issue', 'return', 'transfer')),
  employee_id       uuid not null references public.employees (id),
  from_employee_id  uuid references public.employees (id),
  return_condition  text check (return_condition in ('good', 'damaged', 'items_missing')),
  data_backed_up    text check (data_backed_up in ('yes', 'not_needed')),
  remarks           text,
  signed_copy_path  text,
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  constraint handover_transfer_has_from check ((purpose = 'transfer') = (from_employee_id is not null))
);

-- ---------------------------------------------------------------------------
-- change_log (append-only)
-- ---------------------------------------------------------------------------
create table public.change_log (
  id                   bigint generated always as identity primary key,
  change_no            text not null unique
                       default 'CHG-' || lpad(nextval('public.change_no_seq')::text, 4, '0'),
  change_date          date not null default current_date,
  asset_id             uuid not null references public.assets (id),
  change_type          text not null check (change_type in
                       ('received_new', 'issued', 'returned', 'reassigned', 'location_changed',
                        'sent_for_repair', 'back_from_repair', 'upgraded', 'part_replaced',
                        'os_reinstalled', 'retired', 'disposed')),
  from_employee_id     uuid references public.employees (id),
  to_employee_id       uuid references public.employees (id),
  from_location_id     smallint references public.locations (id),
  to_location_id       smallint references public.locations (id),
  from_text            text,
  to_text              text,
  condition            text check (condition in ('new', 'good', 'fair', 'poor', 'damaged')),
  accessories          text[] not null default '{}',
  accessories_missing  text[] not null default '{}',
  reason               text,
  handover_form_id     bigint references public.handover_forms (id),
  created_at           timestamptz not null default now(),
  created_by           uuid default auth.uid()
);

create index change_log_asset on public.change_log (asset_id, change_date desc, id desc);
create index change_log_form on public.change_log (handover_form_id) where handover_form_id is not null;

-- ---------------------------------------------------------------------------
-- audit_log (append-only), filled by a trigger on the tables listed in docs/SCHEMA.md that
-- exist so far. fault_log, service_jobs and service_lines join in Phase 2.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text not null,
  action      text not null check (action in ('insert', 'update', 'delete')),
  old_data    jsonb,
  new_data    jsonb,
  user_id     uuid default auth.uid(),
  at          timestamptz not null default now()
);

create index audit_log_record on public.audit_log (table_name, record_id, at desc);

-- security definer: it must write audit_log, which no API role can.
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (table_name, record_id, action, old_data, new_data)
  values (
    tg_table_name,
    coalesce(row_data ->> 'id', row_data ->> 'key',
             (row_data ->> 'asset_id') || ':' || (row_data ->> 'accessory_type_id')),
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

revoke all on function public.write_audit_log() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['employees', 'assets', 'asset_accessories', 'categories',
                           'accessory_types', 'vendors', 'stock_items', 'profiles', 'settings']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I '
                   'for each row execute function public.write_audit_log()', t || '_audit', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles.employee_id gets the foreign key Phase 0 left out.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_employee_id_fkey foreign key (employee_id) references public.employees (id);

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
-- Read-only for every API role; the RPCs (security definer) do all the writing.
do $$
declare
  t text;
begin
  foreach t in array array['employees', 'assets', 'asset_accessories', 'handover_forms',
                           'change_log', 'audit_log']
  loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_viewer_or_admin())', t || '_read', t);
  end loop;
end;
$$;

-- Admin edits employee details and the non-movement columns of assets directly. No inserts
-- into assets (add_assets does that) and no deletes anywhere: people are marked Left, assets
-- are Retired or Disposed (CLAUDE.md, domain rule 4).
grant insert, update on table public.employees to authenticated;
create policy employees_admin_insert on public.employees for insert to authenticated
  with check (public.is_admin());
create policy employees_admin_update on public.employees for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant update on table public.assets to authenticated;
create policy assets_admin_update on public.assets for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on sequence public.change_no_seq, public.handover_no_seq from anon, authenticated;
revoke all on all sequences in schema public from anon;

-- "Mark as left" is blocked while the person still holds anything (BUILD_PLAN, People).
create or replace function public.employees_left_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  held text;
begin
  if new.status = 'left' and old.status is distinct from 'left' then
    select string_agg(asset_tag, ', ' order by asset_tag) into held
    from public.assets where assigned_employee_id = new.id;
    if held is not null then
      raise exception 'Still holds: %. Return or transfer these first.', held;
    end if;
  end if;
  return new;
end;
$$;

create trigger employees_left_guard before update on public.employees
  for each row execute function public.employees_left_guard();
