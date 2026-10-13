-- Phase 1: read-only summaries for the dashboard, People and reports (docs/SCHEMA.md -> Views).
-- security_invoker = true, so the caller's RLS applies: anon and users with no profile see
-- nothing through these either. "Active" means not Retired or Disposed.

create view public.v_category_summary with (security_invoker = true) as
select
  c.id                                                              as category_id,
  c.name                                                            as category,
  c.category_group,
  c.tag_prefix,
  count(a.id) filter (where a.status not in ('retired', 'disposed')) as active_total,
  count(a.id) filter (where a.status = 'in_use')                     as in_use,
  count(a.id) filter (where a.status = 'spare')                      as spare,
  count(a.id) filter (where a.status = 'under_repair')               as under_repair,
  count(a.id) filter (where a.status = 'faulty')                     as faulty,
  count(a.id) filter (where a.status = 'lost_stolen')                as lost_stolen,
  c.min_spares,
  count(a.id) filter (where a.status = 'spare') < c.min_spares       as below_min
from public.categories c
left join public.assets a on a.category_id = c.id
where c.is_active
group by c.id;

-- Active assets per department (null -> "Common") and category.
create view public.v_department_summary with (security_invoker = true) as
select
  d.id                       as department_id,
  coalesce(d.name, 'Common') as department,
  c.id                       as category_id,
  c.name                     as category,
  count(*)                   as active_total
from public.assets a
join public.categories c on c.id = a.category_id
left join public.departments d on d.id = a.department_id
where a.status not in ('retired', 'disposed')
group by d.id, d.name, c.id, c.name;

-- One row per asset someone holds, with its accessories. People page and leaver clearance.
create view public.v_employee_holdings with (security_invoker = true) as
select
  e.id            as employee_id,
  e.full_name,
  e.status        as employee_status,
  a.id            as asset_id,
  a.asset_tag,
  c.name          as category,
  a.make,
  a.model,
  a.serial_number,
  a.condition,
  a.date_assigned,
  l.name          as location,
  coalesce((select array_agg(t.name order by t.name)
            from public.asset_accessories aa
            join public.accessory_types t on t.id = aa.accessory_type_id
            where aa.asset_id = a.id), '{}') as accessories
from public.employees e
join public.assets a on a.assigned_employee_id = e.id
join public.categories c on c.id = a.category_id
left join public.locations l on l.id = a.location_id;

-- One row of counts. Phases 2 and 4 add open faults, stock to reorder and items due soon.
create view public.v_dashboard with (security_invoker = true) as
select
  count(*) filter (where status not in ('retired', 'disposed'))                       as active_total,
  count(*) filter (where status = 'in_use')                                            as in_use,
  count(*) filter (where status = 'spare')                                             as spare_total,
  count(*) filter (where status in ('faulty', 'under_repair'))                         as faulty_or_repair,
  count(*) filter (where status = 'lost_stolen')                                       as lost_stolen,
  count(*) filter (where status = 'in_use' and assigned_employee_id is null
                   and location_id is null)                                            as in_use_without_holder,
  (select count(*) from public.v_category_summary where below_min)                     as categories_below_min
from public.assets
-- An aggregate always returns one row, even of zeros; without this a user with no profile
-- would get that row. They should get nothing at all.
having public.is_viewer_or_admin();

revoke all on public.v_category_summary, public.v_department_summary,
              public.v_employee_holdings, public.v_dashboard
from anon, authenticated;
grant select on public.v_category_summary, public.v_department_summary,
                public.v_employee_holdings, public.v_dashboard
to authenticated;
