-- Phase 1: reference lists and their seeds (docs/SCHEMA.md -> Tables, Seed data).
--
-- Access, for every table here (docs/SCHEMA.md -> Access matrix):
--   anon:            nothing.
--   viewer:          select.
--   admin:           select, insert, update. Delete only on locations, vendors and
--                    accessory_types, and foreign keys stop a row in use from being deleted.
-- Hosted Supabase grants ALL on new tables to anon and authenticated by default, so every
-- table below revokes that first and grants back only what it needs.

-- Deny anon by default from here on. Hosted Supabase grants every new table and sequence in
-- public to anon; switch that off, as migration revoke_anon_function_execute did for functions.
-- Each table below still revokes explicitly, so this is a second lock, not the only one.
alter default privileges for role postgres in schema public revoke all on tables    from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------------
create table public.departments (
  id         smallint generated always as identity primary key,
  name       text    not null unique,
  is_active  boolean not null default true
);

-- ---------------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------------
create table public.locations (
  id         smallint generated always as identity primary key,
  name       text    not null,
  kind       text    not null default 'other'
             check (kind in ('room', 'desk', 'store', 'other')),
  is_active  boolean not null default true
);
create unique index locations_name_ci on public.locations (lower(name));

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id                        smallint generated always as identity primary key,
  name                      text    not null unique,
  category_group            text    not null default 'it'
                            check (category_group in ('it', 'facilities')),
  tag_prefix                text    not null unique check (tag_prefix ~ '^[A-Z]{3}$'),
  next_tag_number           int     not null default 1 check (next_tag_number >= 1),
  min_spares                int     not null default 0 check (min_spares >= 0),
  typical_replacement_cost  numeric(12,2) check (typical_replacement_cost >= 0),
  service_interval_days     int     check (service_interval_days > 0),
  custom_fields             jsonb   not null default '[]' check (jsonb_typeof(custom_fields) = 'array'),
  is_active                 boolean not null default true
);

-- ---------------------------------------------------------------------------
-- vendors
-- ---------------------------------------------------------------------------
create table public.vendors (
  id              bigint generated always as identity primary key,
  name            text    not null unique,
  kind            text    not null default 'both' check (kind in ('supplier', 'service', 'both')),
  contact_person  text,
  phone           text,
  email           text,
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- stock_items (consumables). qty_on_hand is maintained only by the stock_movements trigger,
-- which arrives in Phase 2; until then it stays 0.
-- ---------------------------------------------------------------------------
create sequence public.stock_code_seq;

create table public.stock_items (
  id             bigint generated always as identity primary key,
  item_code      text    not null unique
                 default 'CON-' || lpad(nextval('public.stock_code_seq')::text, 3, '0'),
  name           text    not null unique,
  unit           text    not null default 'pcs',
  qty_on_hand    int     not null default 0 check (qty_on_hand >= 0),
  reorder_level  int     not null default 0 check (reorder_level >= 0),
  location_id    smallint references public.locations (id),
  notes          text,
  is_active      boolean not null default true
);

-- ---------------------------------------------------------------------------
-- accessory_types
-- ---------------------------------------------------------------------------
create table public.accessory_types (
  id             smallint generated always as identity primary key,
  name           text    not null unique,
  stock_item_id  bigint  references public.stock_items (id),
  is_active      boolean not null default true
);

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------
create table public.settings (
  key    text  primary key,
  value  jsonb not null
);

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------
insert into public.departments (name) values ('HR'), ('Sales'), ('Retention'), ('Travel'), ('IT');

insert into public.locations (name, kind) values ('IT store', 'store');

insert into public.categories (name, tag_prefix) values
  ('Laptop', 'LAP'), ('Desktop', 'DSK'), ('Monitor', 'MON'), ('Headset', 'HST'),
  ('Webcam', 'CAM'), ('Docking Station', 'DOC'), ('Printer', 'PRN'), ('Scanner', 'SCN'),
  ('Router', 'RTR'), ('External Drive', 'HDD'), ('Switch', 'SWT'), ('Firewall', 'FWL'),
  ('Access Point', 'WAP'), ('Server / NAS', 'SRV'), ('UPS', 'UPS'), ('IP Phone', 'PHN'),
  ('Mobile Phone', 'MOB'), ('CCTV / NVR', 'CCT'), ('Projector', 'PRJ'), ('Other', 'OTH');

-- service_interval_days 90 is a placeholder until Sahan confirms it (CLAUDE.md, open decision 4).
insert into public.categories (name, category_group, tag_prefix, service_interval_days, custom_fields)
values ('Air Conditioner', 'facilities', 'ACU', 90, '[
  {"key": "btu",      "label": "BTU",      "type": "number",  "required": false},
  {"key": "inverter", "label": "Inverter", "type": "boolean", "required": false},
  {"key": "gas_type", "label": "Gas type", "type": "text",    "required": false}
]');

insert into public.stock_items (name, reorder_level) values ('Optical mouse', 10);

-- Mouse and Keyboard are accessories, not categories (CLAUDE.md, domain rule 1; decided 13/10/2026).
insert into public.accessory_types (name, stock_item_id) values
  ('Charger', null),
  ('Mouse', (select id from public.stock_items where name = 'Optical mouse')),
  ('Mouse pad', null),
  ('Bag', null),
  ('Keyboard', null);

insert into public.settings (key, value) values
  ('company_name',         '"Phoenix BPO Solutions"'),
  ('repair_replace_pct',   '50'),
  ('repeat_fault_count',   '3'),
  ('repeat_fault_months',  '12'),
  ('reminder_window_days', '30'),
  ('report_rate_limit',    '3');

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['departments', 'locations', 'categories', 'vendors', 'stock_items',
                           'accessory_types', 'settings']
  loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_viewer_or_admin())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_update', t);
  end loop;

  -- Only unused rows of these three can be deleted; their foreign keys refuse the rest.
  foreach t in array array['locations', 'vendors', 'accessory_types']
  loop
    execute format('grant delete on table public.%I to authenticated', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t || '_admin_delete', t);
  end loop;
end;
$$;

revoke all on sequence public.stock_code_seq from anon, authenticated;
grant usage on sequence public.stock_code_seq to authenticated;
revoke all on all sequences in schema public from anon;
