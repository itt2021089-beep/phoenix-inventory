-- Phase 3: a rate-limited report is answered with HTTP 429 (Too Many Requests), not 500.
--
-- Found in the browser run: submit_fault_report raised the two rate-limit refusals with SQLSTATE
-- 54000, which PostgREST turns into a 500 Internal Server Error. The words shown to staff were
-- right, but a 500 for something expected is noise in the logs and wrong for any client.
-- PostgREST treats a SQLSTATE of PT<status> as that HTTP status, so these now use PT429.
-- Only the two codes change; everything else is as in 20261016090000_public_report.sql
-- (create or replace keeps the grants: anon only).

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
      using errcode = 'PT429';
  end if;
  if (select count(*) from public.fault_log f
      where f.source = 'qr' and f.created_at > now() - interval '1 hour')
     >= public._int_setting('report_rate_limit_total', 20) then
    raise exception 'Too many reports right now. Please try again later, or tell IT directly.'
      using errcode = 'PT429';
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
