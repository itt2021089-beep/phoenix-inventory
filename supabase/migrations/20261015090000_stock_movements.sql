-- Phase 2: consumable stock moves (docs/SCHEMA.md -> stock_movements).
--
-- stock_items.qty_on_hand is kept in step with its movements by a trigger, and by nothing else:
-- a direct edit of the quantity is refused, so the number always equals the sum of its history.
-- Stock never goes below 0 (Sahan, 14/10/2026): a movement that would do so is refused, and the
-- whole action it belongs to (an issue, say) saves nothing.

create table public.stock_movements (
  id             bigint generated always as identity primary key,
  stock_item_id  bigint not null references public.stock_items (id),
  movement_date  date   not null default current_date,
  movement_type  text   not null check (movement_type in
                 ('received', 'issued', 'returned', 'adjusted', 'written_off')),
  qty_change     int    not null check (qty_change <> 0),
  employee_id    uuid     references public.employees (id),
  department_id  smallint references public.departments (id),
  change_log_id  bigint   references public.change_log (id),
  vendor_id      bigint   references public.vendors (id),
  unit_cost      numeric(12,2) check (unit_cost >= 0),
  reference      text,
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  -- In comes positive, out comes negative; an adjustment can go either way.
  constraint stock_movements_sign check (
    (movement_type in ('received', 'returned') and qty_change > 0)
    or (movement_type in ('issued', 'written_off') and qty_change < 0)
    or movement_type = 'adjusted')
);

create index stock_movements_item on public.stock_movements (stock_item_id, movement_date desc, id desc);
create index stock_movements_change on public.stock_movements (change_log_id) where change_log_id is not null;

-- ---------------------------------------------------------------------------
-- qty_on_hand changes only through a movement.
-- ---------------------------------------------------------------------------
create or replace function public.stock_items_qty_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.stock_move', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.qty_on_hand <> 0 then
    raise exception 'A new stock item starts at 0. Record what you have with Receive.';
  end if;
  if tg_op = 'UPDATE' and new.qty_on_hand is distinct from old.qty_on_hand then
    raise exception 'Stock changes only through a movement: Receive, Issue, Adjust or Write off';
  end if;
  return new;
end;
$$;

create trigger stock_items_qty_guard before insert or update on public.stock_items
  for each row execute function public.stock_items_qty_guard();

-- Applies a movement to its item. Refuses anything that would leave less than 0.
create or replace function public.stock_movements_apply()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  item     public.stock_items;
  previous text := coalesce(current_setting('app.stock_move', true), '');
begin
  -- RLS checks the insert only after this trigger has run, so say no here first.
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into item from public.stock_items where id = new.stock_item_id for update;
  if not found then
    raise exception 'Unknown stock item %', new.stock_item_id;
  end if;
  if item.qty_on_hand + new.qty_change < 0 then
    raise exception '% stock is %, so % cannot be taken out', item.name, item.qty_on_hand, -new.qty_change
      using errcode = 'check_violation';
  end if;

  -- Same pattern as the asset guard: switch on for this update, put back what was there.
  perform set_config('app.stock_move', 'on', true);
  update public.stock_items set qty_on_hand = qty_on_hand + new.qty_change where id = item.id;
  perform set_config('app.stock_move', previous, true);
  return new;
end;
$$;

create trigger stock_movements_apply before insert on public.stock_movements
  for each row execute function public.stock_movements_apply();

-- A movement is a log line: never edited, never deleted. A mistake gets a correcting Adjust.
create or replace function public.stock_movements_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Stock movements are permanent. Fix a mistake with an Adjust.';
end;
$$;

create trigger stock_movements_append_only before update or delete on public.stock_movements
  for each row execute function public.stock_movements_append_only();

-- ---------------------------------------------------------------------------
-- Grants and RLS: viewers read, admin adds movements. Nobody edits or deletes them.
-- ---------------------------------------------------------------------------
revoke all on table public.stock_movements from anon, authenticated;
grant select, insert on table public.stock_movements to authenticated;
alter table public.stock_movements enable row level security;
create policy stock_movements_read on public.stock_movements for select to authenticated
  using (public.is_viewer_or_admin());
create policy stock_movements_admin_insert on public.stock_movements for insert to authenticated
  with check (public.is_admin());
