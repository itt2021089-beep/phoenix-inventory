-- Phase 0: app users and the two role helpers.
--
-- Accounts are created by hand in the Supabase dashboard (Authentication -> Users -> Add user,
-- auto-confirm). A profiles row here is what actually grants access: a logged-in user with no
-- profiles row can read nothing, and the app shows them the "ask IT for access" screen.
--
-- Keep docs/SCHEMA.md in step with any change to this file.

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text        not null,
  role        text        not null check (role in ('admin', 'viewer')),
  employee_id uuid,  -- FK to employees, added in the Phase 1 `core` migration
  created_at  timestamptz not null default now()
);

comment on table public.profiles is
  'App users. No row means no access. employee_id gets its FK to employees in Phase 1.';

-- ---------------------------------------------------------------------------
-- Role helpers
--
-- security definer so they can read profiles regardless of the caller's own policies, which
-- is what stops a policy on profiles from recursing into itself. search_path is pinned so a
-- caller cannot shadow `profiles` with their own object.
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

comment on function public.is_admin() is
  'True when the caller has a profiles row with role = admin.';

create or replace function public.is_viewer_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
  );
$$;

comment on function public.is_viewer_or_admin() is
  'True when the caller has any profiles row, i.e. admin or viewer.';

revoke all on function public.is_admin() from public;
revoke all on function public.is_viewer_or_admin() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_viewer_or_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: deny by default, then add back only what is needed.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

-- Deliberately NOT `force row level security`. The helpers above are security definer and
-- read this table as its owner; forcing RLS subjects the owner to these policies too, and
-- since the policies only grant `authenticated`, both helpers would return false for every
-- user and lock the whole app out silently. Verified against Postgres with a non-superuser
-- owner. Plain `enable` is safe here: neither anon nor authenticated owns this table, so
-- the policies apply to them in full. Same applies to every table added in later phases.

-- No anon grants at all: a logged-out caller holding the publishable key sees nothing.
revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;

-- A signed-in user may read their own row. Without this the app could never tell an
-- admin from a viewer, nor a viewer from someone with no access at all.
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

-- Admins and viewers can read every profile (the access matrix in docs/SCHEMA.md gives
-- viewers select on all tables).
create policy profiles_select_all
  on public.profiles
  for select
  to authenticated
  using (public.is_viewer_or_admin());

-- No insert, update or delete policy on purpose. Sahan creates profiles in the Supabase
-- dashboard; nothing in the app writes this table, and with RLS forced that means nobody
-- can grant themselves a role or promote themselves to admin through the API.
