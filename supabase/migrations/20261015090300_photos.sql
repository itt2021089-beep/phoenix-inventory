-- Phase 2: photos (docs/SCHEMA.md -> photos, Storage).
--
-- The files live in the private Storage bucket `photos`; this table says what each one is a
-- photo of. The browser compresses before upload (longest side 1600 px, about 200 KB) and shows
-- them through short-lived signed URLs, so nothing here is ever public.
-- Like the logs, photos are never deleted: there is no delete grant or policy, on the table or
-- in the bucket. The `reports/` folder for the public QR form arrives with Phase 3.

create table public.photos (
  id            bigint generated always as identity primary key,
  entity_type   text not null check (entity_type in
                ('asset', 'change_log', 'fault', 'handover_form', 'service_job')),
  entity_id     text not null check (btrim(entity_id) <> ''),
  kind          text not null check (kind in
                ('issue', 'return', 'damage', 'signed_form', 'invoice', 'asset', 'report')),
  storage_path  text not null unique,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  -- The file sits in the folder for what it is a photo of (a QR report's photo in reports/).
  constraint photos_path_matches check (
    storage_path ~ ('^' || case entity_type
                             when 'asset'         then 'assets/[^/]+'
                             when 'change_log'    then 'changes/[^/]+'
                             when 'fault'         then '(faults/[^/]+|reports)'
                             when 'handover_form' then 'handover/[^/]+'
                             when 'service_job'   then 'service/[^/]+'
                           end || '/.+')
    -- No empty, "." or ".." parts, and it names a file rather than a folder.
    and storage_path !~ '(^|/)\.{0,2}(/|$)')
);

create index photos_entity on public.photos (entity_type, entity_id);

revoke all on table public.photos from anon, authenticated;
grant select, insert on table public.photos to authenticated;
alter table public.photos enable row level security;
create policy photos_read on public.photos for select to authenticated
  using (public.is_viewer_or_admin());
create policy photos_admin_insert on public.photos for insert to authenticated
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: the private bucket and who may touch which folder.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5 * 1024 * 1024, array['image/*'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Admin and viewers read (signed URLs are made with the reader's own rights).
create policy photos_bucket_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_viewer_or_admin());

-- Admin uploads, into the known folders only. No update (so no overwrite) and no delete.
create policy photos_bucket_admin_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and public.is_admin()
    and (storage.foldername(name))[1] in ('assets', 'changes', 'faults', 'handover', 'service')
  );
