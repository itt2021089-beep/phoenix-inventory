# Database schema

This file is the source of truth for the data model (Postgres on Supabase). When a migration
changes the schema, update this file in the same commit.

Notation used below:

- `PK` / `FK`: primary / foreign key.
- `audit cols`: `created_at timestamptz default now()`, `created_by uuid default auth.uid()`,
  `updated_at timestamptz` (kept current by a trigger).
- Display numbers (`CHG-0001` etc.) come from a column default that reads a sequence. This lets the
  importer insert the existing numbers from Excel and then move the sequence past them with
  `setval`.

## Code lists

Code lists are stored as `text` with a `CHECK` constraint, not as Postgres enums, so they are easy
to extend. The labels shown to users live in `src/lib/constants.ts`.

| List | Code → label |
|---|---|
| asset_status | `in_use` In Use · `spare` Spare · `under_repair` Under Repair · `faulty` Faulty · `lost_stolen` Lost / Stolen · `retired` Retired · `disposed` Disposed |
| condition | `new` New · `good` Good · `fair` Fair · `poor` Poor · `damaged` Damaged |
| change_type | `received_new` Received (New) · `issued` Issued · `returned` Returned · `reassigned` Reassigned · `location_changed` Location Changed · `sent_for_repair` Sent for Repair · `back_from_repair` Back from Repair · `upgraded` Upgraded · `part_replaced` Part Replaced · `os_reinstalled` OS Reinstalled · `retired` Retired · `disposed` Disposed |
| fault_status | `open` Open · `in_progress` In Progress · `with_vendor` With Vendor · `closed` Closed |
| fault_cause | `wear_and_tear` · `accident` · `misuse` · `power_issue` · `manufacturing_defect` · `unknown` |
| fault_source | `admin` · `qr` |
| category_group | `it` IT · `facilities` Facilities |
| location_kind | `room` · `desk` · `store` · `other` |
| employee_status | `active` · `left` |
| user_role | `admin` · `viewer` |
| handover_purpose | `issue` · `return` · `transfer` |
| service_job_type | `cleaning` · `repair` · `service` · `inspection` · `installation` |
| vendor_kind | `supplier` · `service` · `both` |
| stock_movement_type | `received` · `issued` · `returned` · `adjusted` · `written_off` |
| photo_kind | `issue` · `return` · `damage` · `signed_form` · `invoice` · `asset` · `report` |

"Active asset" means `status not in ('retired','disposed')`.

## Tables

### departments
```
id          smallint identity PK
name        text not null unique          -- HR, Sales, Retention, Travel, IT
is_active   boolean not null default true
```

### locations
```
id          smallint identity PK
name        text not null                 -- "Travel section / Desk 1", "CEO room", "IT store"
kind        text not null default 'other' -- location_kind
is_active   boolean not null default true
unique index on lower(name)
```

### employees
```
id                   uuid PK default gen_random_uuid()
full_name            text not null
nid                  text not null unique -- normalised: no "NIC" prefix, no spaces, uppercase
                                          -- check: ^[0-9]{12}$ or ^[0-9]{9}[VX]$
department_id        smallint FK departments
designation          text
contact_no           text
default_location_id  smallint FK locations -- their desk; used as the default when issuing
status               text not null default 'active'  -- employee_status
joined_on            date
left_on              date                 -- check: status = 'left' requires left_on
notes                text
audit cols
```

### profiles (app users)
```
id           uuid PK FK auth.users(id) on delete cascade
full_name    text not null
role         text not null               -- user_role
employee_id  uuid FK employees
created_at   timestamptz default now()
```
SQL helpers (`security definer`, `stable`, `set search_path = public`):
- `is_admin()`: true if the current user's profile role is `admin`.
- `is_viewer_or_admin()`: true if the current user has any profile row.

`profiles` has no insert, update or delete policy. Sahan creates and edits profiles in the
Supabase dashboard, so nothing can grant itself a role through the API.

> **Use `enable row level security`, never `force row level security`.**
> The helpers above are `security definer` and read `profiles` as the table's owner. `force`
> subjects the owner to the policies too, so both helpers return false for every user and the
> whole app locks out silently — no error, just an empty app. Verified against Postgres with a
> non-superuser owner; a superuser owner hides the problem, so it will not show up in every
> test setup. `enable` on its own is safe here, because neither `anon` nor `authenticated` owns
> any table. This applies to every table, not just `profiles`.

### categories
```
id                        smallint identity PK
name                      text not null unique
category_group            text not null default 'it'      -- category_group
tag_prefix                text not null unique             -- check ^[A-Z]{3}$
next_tag_number           int  not null default 1
min_spares                int  not null default 0
typical_replacement_cost  numeric(12,2)                    -- used when purchase_price is unknown
service_interval_days     int                              -- e.g. AC; null = no routine service
custom_fields             jsonb not null default '[]'
                          -- [{ "key": "btu", "label": "BTU", "type": "number"|"text"|"date"|"boolean"|"select",
                          --    "options": [...], "required": false }]
is_active                 boolean not null default true
```

### vendors
```
id              bigint identity PK
name            text not null unique
kind            text not null default 'both'   -- vendor_kind
contact_person  text
phone           text
email           text
notes           text
is_active       boolean not null default true
created_at      timestamptz default now()
```

### stock_items (consumables)
```
id             bigint identity PK
item_code      text not null unique default 'CON-' || lpad(nextval('stock_code_seq')::text, 3, '0')
name           text not null unique               -- "Optical mouse"
unit           text not null default 'pcs'
qty_on_hand    int  not null default 0             -- maintained ONLY by the stock_movements trigger
reorder_level  int  not null default 0
location_id    smallint FK locations
notes          text
is_active      boolean not null default true
```

### accessory_types
```
id             smallint identity PK
name           text not null unique   -- Charger, Mouse, Mouse pad, Bag, Keyboard
stock_item_id  bigint FK stock_items  -- if set: issuing deducts 1, returning adds 1
is_active      boolean not null default true
```

### assets
```
id                    uuid PK default gen_random_uuid()
asset_tag             text not null unique        -- check ^PBS-[A-Z]{3}-[0-9]{3,}$
category_id           smallint FK categories not null
make                  text
model                 text
serial_number         text                        -- unique index on upper(serial_number) where not null
status                text not null default 'spare'   -- asset_status
condition             text not null default 'good'    -- condition
assigned_employee_id  uuid FK employees
department_id         smallint FK departments     -- null = Common
location_id           smallint FK locations
date_assigned         date
specification         text                        -- free text, e.g. "i5-7300U / 8GB / 256GB SSD"
custom_values         jsonb not null default '{}' -- values for the category's custom_fields
accessories_note      text                        -- e.g. "Lenovo 65W charger"
purchase_date         date
purchase_price        numeric(12,2)
supplier_id           bigint FK vendors
invoice_no            text
warranty_until        date
label_printed_at      timestamptz                 -- null = QR label not printed yet
notes                 text
audit cols + updated_by uuid
checks:
  status = 'spare'                     -> assigned_employee_id is null
  status in ('retired','disposed')     -> assigned_employee_id is null
guard trigger:
  raise if status, assigned_employee_id, location_id or department_id change
  unless current_setting('app.via_rpc', true) = 'on'.
  The movement RPCs set it with set_config('app.via_rpc', 'on', true).
```

Dashboard warning (not a constraint): an asset that is In Use but has no person and no location.

### asset_accessories (accessories currently with an asset)
```
asset_id           uuid FK assets
accessory_type_id  smallint FK accessory_types
PK (asset_id, accessory_type_id)
```

### handover_forms
```
id                bigint identity PK
form_no           text not null unique default 'HO-' || lpad(nextval('handover_no_seq')::text, 4, '0')
form_date         date not null default current_date
purpose           text not null           -- handover_purpose
employee_id       uuid FK employees not null  -- receiver (issue/transfer) or returner (return)
from_employee_id  uuid FK employees           -- transfer only
return_condition  text                    -- 'good' | 'damaged' | 'items_missing' (return only)
data_backed_up    text                    -- 'yes' | 'not_needed' (return only)
remarks           text
signed_copy_path  text                    -- photo/scan of the signed paper copy
created_at, created_by
```

### change_log (append-only)
```
id                   bigint identity PK
change_no            text not null unique default 'CHG-' || lpad(nextval('change_no_seq')::text, 4, '0')
change_date          date not null default current_date
asset_id             uuid FK assets not null
change_type          text not null                -- change_type
from_employee_id     uuid FK employees
to_employee_id       uuid FK employees
from_location_id     smallint FK locations
to_location_id       smallint FK locations
from_text            text                         -- free text: old part, legacy value
to_text              text                         -- free text: new part, legacy value
condition            text                         -- condition at that moment
accessories          text[] not null default '{}' -- accessory names handed over / returned
accessories_missing  text[] not null default '{}'
reason               text                         -- "Reason / Details"
handover_form_id     bigint FK handover_forms
created_at, created_by
```

### fault_log
```
id                       bigint identity PK
fault_no                 text not null unique default 'FLT-' || lpad(nextval('fault_no_seq')::text, 4, '0')
asset_id                 uuid FK assets not null
date_reported            date not null default current_date
source                   text not null default 'admin'  -- fault_source
reported_by_employee_id  uuid FK employees
reported_by_name         text                 -- as typed on the public QR form
holder_employee_id       uuid FK employees    -- assets.assigned_employee_id when reported (auto)
description              text not null        -- "Fault / Issue"
status                   text not null default 'open'   -- fault_status
action_taken             text
vendor_id                bigint FK vendors
cost                     numeric(12,2) not null default 0
under_warranty           boolean not null default false
service_line_id          bigint FK service_lines -- set when fixed inside a service job (cost must be 0)
date_closed              date                 -- check: status = 'closed' requires date_closed
cause                    text                 -- fault_cause (admin finding)
responsible_employee_id  uuid FK employees    -- admin finding
finding_notes            text
remarks                  text
audit cols
```

### service_jobs
```
id             bigint identity PK
job_no         text not null unique default 'SRV-' || lpad(nextval('service_no_seq')::text, 4, '0')
vendor_id      bigint FK vendors
job_type       text not null              -- service_job_type
service_date   date not null
invoice_no     text
invoice_total  numeric(12,2)              -- as printed on the invoice; UI warns if lines don't add up
notes          text
created_at, created_by
```

### service_lines
```
id             bigint identity PK
job_id         bigint FK service_jobs not null on delete cascade
asset_id       uuid FK assets not null
work_done      text not null              -- "Cleaned", "Cleaned + gas refill", ...
cost           numeric(12,2) not null default 0
next_due_date  date                       -- trigger: if null, service_date + category.service_interval_days
notes          text
```

### stock_movements
```
id             bigint identity PK
stock_item_id  bigint FK stock_items not null
movement_date  date not null default current_date
movement_type  text not null              -- stock_movement_type
qty_change     int  not null              -- check <> 0; received/returned > 0; issued/written_off < 0; adjusted either way
employee_id    uuid FK employees
department_id  smallint FK departments
change_log_id  bigint FK change_log       -- when caused by an accessory tick on issue/return
vendor_id      bigint FK vendors
unit_cost      numeric(12,2)
reference      text                       -- invoice no, "Opening balance from Excel", ...
notes          text
created_at, created_by
trigger: update stock_items.qty_on_hand; raise if it would go below 0
```

### photos
```
id            bigint identity PK
entity_type   text not null    -- 'asset' | 'change_log' | 'fault' | 'handover_form' | 'service_job'
entity_id     text not null    -- id of that row, as text
kind          text not null    -- photo_kind
storage_path  text not null
created_at, created_by
index on (entity_type, entity_id)
```

### settings
```
key    text PK
value  jsonb not null
seed:
  company_name           "Phoenix BPO Solutions"
  repair_replace_pct     50
  repeat_fault_count     3
  repeat_fault_months    12
  reminder_window_days   30
  report_rate_limit      3      -- max QR reports per asset per hour
```

### audit_log (append-only)
```
id          bigint identity PK
table_name  text not null
record_id   text not null
action      text not null      -- insert | update | delete
old_data    jsonb
new_data    jsonb
user_id     uuid default auth.uid()
at          timestamptz not null default now()
trigger on: employees, assets, asset_accessories, categories, accessory_types, vendors,
            fault_log, service_jobs, service_lines, stock_items, profiles, settings
```

## RPC functions

Every write function except the public ones:
- is `security definer` with `set search_path = public`
- calls `is_admin()` first and raises `not allowed` otherwise
- runs as a single transaction
- sets `app.via_rpc` before touching asset movement columns

**Execute grants.** New functions in `public` are not callable by `anon` by default: migration
`revoke_anon_function_execute` switched off both the Supabase default grant to `anon` and the
Postgres built-in grant to `PUBLIC`. So every function says who may call it:
- `grant execute on function ... to authenticated;` for anything the app calls.
- The three public functions (`get_public_asset`, `submit_fault_report`, `ping`) also need
  `grant execute on function ... to anon;`. Nothing else ever gets that grant.

| Function | What it does |
|---|---|
| `next_asset_tag(category_id)` | Locks the category row and returns `PBS-<prefix>-<NNN>` (at least 3 digits), then increments `next_tag_number`. |
| `add_assets(category_id, qty, fields jsonb, serials text[])` | Bulk-creates Spare assets with tags and writes a `received_new` change row for each. Returns the tags. |
| `issue_assets(employee_id, items jsonb, location_id, issue_date, reason, make_form bool)` | `items` is `[{asset_id, condition, accessory_type_ids[]}]`. Sets each asset to In Use with the person, department (from the employee), location (default: the employee's desk) and `date_assigned`. Writes `issued` rows, sets `asset_accessories`, and deducts linked accessory stock. Optionally creates the HO form. Returns the `form_no`. |
| `return_assets(items jsonb, return_condition, data_backed_up, remarks, make_form bool)` | `items` is `[{asset_id, condition, accessories_returned[], accessories_missing[], next_status, fault_description?}]`, where `next_status` is spare, under_repair or faulty. Clears the person and sets the status. Writes `returned` rows, returns accessory stock, and opens a fault if a description is given. |
| `transfer_assets(from_employee_id, to_employee_id, asset_ids uuid[], make_form bool)` | Writes `reassigned` rows. Department and location follow the new employee. |
| `swap_asset(faulty_asset_id, spare_asset_id, fault_description)` | Opens a fault on the old asset (→ Under Repair) and issues the spare to the same person and location. Moves the accessories over. Writes both change rows. |
| `move_asset(asset_id, location_id, department_id, reason)` | Writes a `location_changed` row. |
| `send_for_repair(asset_id, fault_id, vendor_id)` / `back_from_repair(asset_id, condition, next_status)` | Status changes plus the change rows. Updates the fault status (with_vendor / closed). |
| `retire_asset(asset_id, reason)` / `dispose_asset(asset_id, reason)` | Clears the person and writes the change row. |
| `record_service_job(header jsonb, lines jsonb)` | Creates the job and its lines and fills `next_due_date`. Returns `job_no`. |
| `get_public_asset(tag)` | **Public (anon).** Returns only `asset_tag, category name, make, model` for an active asset, or nothing. |
| `submit_fault_report(tag, reporter_name, description, photo_path)` | **Public (anon).** Validates the lengths (name ≤ 80, description 5–1000) and the rate limit per asset. Inserts a fault with `source = 'qr'` and fills `holder_employee_id`. Returns `fault_no`. |
| `ping()` | **Public.** Returns 1. Used by the keep-alive workflow. |

## Views (all `with (security_invoker = true)`)

| View | Columns / purpose |
|---|---|
| `v_category_summary` | Per category: active total, in_use, spare, under_repair, faulty, lost_stolen, min_spares, `below_min` |
| `v_department_summary` | Active assets per department (null → "Common") × category |
| `v_employee_holdings` | Per employee: each asset held plus its accessories. Used by the People page and the leaver clearance sheet. |
| `v_stock_levels` | Stock items with `qty_on_hand`, `reorder_level`, `needs_reorder` |
| `v_due_soon` | Warranty endings and next service dates (latest line per asset) within `reminder_window_days`, or overdue |
| `v_asset_costs` | Per asset: `repair_spend` (fault costs + service line costs), `replacement_basis` (purchase_price, else the category's typical cost), `spend_pct`, `faults_last_12m`, `flagged` |
| `v_open_faults` | Faults not closed, with asset, holder, vendor and age in days |
| `v_dashboard` | One row: open faults, faulty/under repair, lost/stolen, spare total, in-use-without-holder, categories below min spares, stock to reorder, items due soon |

## Access matrix (RLS)

| Object | admin | viewer | anon (logged out) |
|---|---|---|---|
| select on all tables and views | ✅ | ✅ | ❌ |
| insert / update on lookups, employees, assets (non-movement columns), faults, service, stock | ✅ | ❌ | ❌ |
| asset movement columns | only through the RPCs | ❌ | ❌ |
| delete | only unused lookup rows (location, vendor, accessory type) | ❌ | ❌ |
| change_log, audit_log, handover_forms | insert through the RPCs; never update or delete | ❌ | ❌ |
| execute write RPCs | ✅ | ❌ (raises `not allowed`) | ❌ |
| execute `get_public_asset`, `submit_fault_report`, `ping` | ✅ | ✅ | ✅ |

## Storage

Bucket `photos`: private, 5 MB per file, `image/*` only.

| Path | admin | viewer | anon |
|---|---|---|---|
| `assets/<asset_id>/...` | read/write | read | ❌ |
| `changes/<change_no>/...` | read/write | read | ❌ |
| `faults/<fault_no>/...` | read/write | read | ❌ |
| `handover/<form_no>/...` | read/write | read | ❌ |
| `service/<job_no>/...` | read/write | read | ❌ |
| `reports/<random-uuid>.jpg` | read | read | insert only (no read, no list) |

## Seed data

- **departments:** HR, Sales, Retention, Travel, IT.
- **categories, IT group:**

  | Name | Prefix | Name | Prefix |
  |---|---|---|---|
  | Laptop | LAP | Switch | SWT |
  | Desktop | DSK | Firewall | FWL |
  | Monitor | MON | Access Point | WAP |
  | Headset | HST | Server / NAS | SRV |
  | Webcam | CAM | UPS | UPS |
  | Docking Station | DOC | IP Phone | PHN |
  | Printer | PRN | Mobile Phone | MOB |
  | Scanner | SCN | CCTV / NVR | CCT |
  | Router | RTR | Projector | PRJ |
  | External Drive | HDD | Other | OTH |

- **categories, Facilities group:** Air Conditioner (ACU).
  - `service_interval_days` 90 is a placeholder: confirm with Sahan.
  - Custom fields: `btu` (number), `inverter` (boolean), `gas_type` (text).
- **Not categories:** Mouse and Keyboard. They are accessories (see the open decisions in
  CLAUDE.md).
- **accessory_types:** Charger, Mouse (linked to stock item "Optical mouse"), Mouse pad, Bag,
  Keyboard.
- **locations:** IT store (`store`). Everything else is created by the importer.
- **settings:** the values listed under the settings table above.
