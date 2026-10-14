-- Phase 3: what a logged-out phone may do after scanning a QR label (docs/SCHEMA.md ->
-- get_public_asset, submit_fault_report, ping; Storage -> reports/).
--
-- These three functions are the only things anon may call (CLAUDE.md, Security and privacy).
-- They run as security definer because anon reads no table at all, so each one:
--   - takes plain text in and checks every input itself;
--   - returns as little as possible: never a name, an NID, a holder or a location;
--   - refuses in short plain words that contain none of the data.
-- submit_fault_report is rate-limited twice (Sahan, 15/10/2026): per asset
-- (`report_rate_limit`, 3 an hour) and across all assets (`report_rate_limit_total`, 20 an hour).

insert into public.settings (key, value) values ('report_rate_limit_total', '20')
on conflict (key) do nothing;

-- A tag as typed or scanned: trimmed and upper-cased, or null if it cannot be a tag.
create or replace function public._clean_tag(p_tag text)
returns text
language sql
immutable
as $$
  select case
    when p_tag is null or char_length(p_tag) > 40 then null
    else nullif(upper(btrim(p_tag)), '')
  end
$$;

-- A setting that holds a whole number, with a fallback if it is missing or not a number.
create or replace function public._int_setting(p_key text, p_default int)
returns int
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select case when jsonb_typeof(value) = 'number' then (value #>> '{}')::int end
     from public.settings where key = p_key),
    p_default)
$$;

revoke all on function public._clean_tag(text), public._int_setting(text, int)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_public_asset: just enough for the report page to say "you are reporting this".
-- ---------------------------------------------------------------------------
create or replace function public.get_public_asset(p_tag text)
returns table (asset_tag text, category text, make text, model text)
language sql
stable
security definer
set search_path = public
as $$
  select a.asset_tag, c.name, a.make, a.model
  from public.assets a
  join public.categories c on c.id = a.category_id
  where a.asset_tag = public._clean_tag(p_tag)
    and a.status not in ('retired', 'disposed')
$$;

-- ---------------------------------------------------------------------------
-- submit_fault_report: a staff member's report from the QR page. Returns the FLT number.
-- ---------------------------------------------------------------------------
create or replace function public.submit_fault_report(
  p_tag            text,
  p_reporter_name  text,
  p_description    text,
  p_photo_path     text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset   uuid;
  who       text;
  what      text;
  photo     text := nullif(btrim(coalesce(p_photo_path, '')), '');
  fault     public.fault_log;
begin
  -- Control characters out (a description keeps its line breaks), spaces tidied.
  who := btrim(regexp_replace(regexp_replace(coalesce(p_reporter_name, ''), '[[:cntrl:]]', ' ', 'g'),
                              '\s+', ' ', 'g'));
  what := btrim(regexp_replace(coalesce(p_description, ''), '[\x01-\x09\x0B-\x1F\x7F]', ' ', 'g'));

  if char_length(who) < 1 or char_length(who) > 80 then
    raise exception 'Please enter your name (up to 80 characters).' using errcode = '22023';
  end if;
  if char_length(what) < 5 or char_length(what) > 1000 then
    raise exception 'Please say what is wrong in 5 to 1000 characters.' using errcode = '22023';
  end if;

  select a.id into v_asset
  from public.assets a
  where a.asset_tag = public._clean_tag(p_tag) and a.status not in ('retired', 'disposed');
  if v_asset is null then
    raise exception 'This label is not recognised. Please tell IT directly.' using errcode = '22023';
  end if;

  if photo is not null then
    if photo !~ '^reports/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'photos' and o.name = photo)
       or exists (select 1 from public.photos p where p.storage_path = photo)
    then
      raise exception 'The photo did not upload. Send the report without it, or try again.'
        using errcode = '22023';
    end if;
  end if;

  -- One report at a time, so two phones at once cannot both slip under the limits.
  perform pg_advisory_xact_lock(hashtext('public.submit_fault_report'));

  if (select count(*) from public.fault_log f
      where f.source = 'qr' and f.asset_id = v_asset
        and f.created_at > now() - interval '1 hour')
     >= public._int_setting('report_rate_limit', 3) then
    raise exception 'This item has already been reported several times in the last hour. IT knows; please try again later.'
      using errcode = '54000';
  end if;
  if (select count(*) from public.fault_log f
      where f.source = 'qr' and f.created_at > now() - interval '1 hour')
     >= public._int_setting('report_rate_limit_total', 20) then
    raise exception 'Too many reports right now. Please try again later, or tell IT directly.'
      using errcode = '54000';
  end if;

  -- The holder is filled in from the asset by fault_log_fill.
  insert into public.fault_log (asset_id, source, reported_by_name, description)
  values (v_asset, 'qr', who, what)
  returning * into fault;

  if photo is not null then
    insert into public.photos (entity_type, entity_id, kind, storage_path)
    values ('fault', fault.id::text, 'report', photo);
  end if;

  return fault.fault_no;
end;
$$;

-- ---------------------------------------------------------------------------
-- ping: the keep-alive job calls this so a free project is never paused for inactivity.
-- ---------------------------------------------------------------------------
create or replace function public.ping()
returns int
language sql
immutable
as $$ select 1 $$;

-- The three public functions, and nothing else, for anon (migration
-- revoke_anon_function_execute switched the default grant off). The two read-only ones are
-- harmless for a logged-in user too. submit_fault_report is for logged-out phones only: a
-- viewer writes nothing (CLAUDE.md), and a logged-in scan opens the asset page instead.
grant execute on function public.get_public_asset(text), public.ping() to anon, authenticated;
-- Supabase's default privileges also hand every new function to authenticated, so take that
-- back explicitly.
revoke all on function public.submit_fault_report(text, text, text, text) from public, authenticated;
grant execute on function public.submit_fault_report(text, text, text, text) to anon;

-- ---------------------------------------------------------------------------
-- Storage: a logged-out phone may add one picture to reports/, under a random name.
-- It cannot read, list, overwrite or delete anything; admin and viewers already read the
-- whole bucket (photos_bucket_read).
-- ---------------------------------------------------------------------------
create policy photos_bucket_anon_report on storage.objects for insert to anon
  with check (
    bucket_id = 'photos'
    and name ~ '^reports/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
  );
