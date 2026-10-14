-- Tests for the photos table and the private `photos` Storage bucket (Phase 2).
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/photos.sql
--
-- Needs Supabase's storage schema (storage.buckets, storage.objects, storage.foldername).
-- One transaction, rolled back at the end. It writes no files, only rows.

begin;

-- Newer Supabase storage refuses a direct delete from storage.objects unless this is on. The
-- test cleans up its fake files that way; it lasts only for this transaction, which is rolled back.
set local storage.allow_delete_query = 'true';

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  if p_user is null then set local role anon; else set local role authenticated; end if;
end $$;

create function pg_temp.expect_error(p_sql text, p_like text, p_label text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: % -- expected an error like "%", got none', p_label, p_like;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm not ilike p_like then
    raise exception 'FAIL: % -- expected an error like "%", got "%"', p_label, p_like, sqlerrm;
  end if;
end $$;

create function pg_temp.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_label; end if;
end $$;

grant execute on function pg_temp.act_as(uuid), pg_temp.expect_error(text, text, text),
  pg_temp.check(boolean, text) to anon, authenticated;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@example.test'),
  ('a0000000-0000-0000-0000-000000000002', 'viewer@example.test');
insert into public.profiles (id, full_name, role) values
  ('a0000000-0000-0000-0000-000000000001', 'Test Admin', 'admin'),
  ('a0000000-0000-0000-0000-000000000002', 'Test Viewer', 'viewer');

do $$
declare
  admin_id  uuid := 'a0000000-0000-0000-0000-000000000001';
  viewer_id uuid := 'a0000000-0000-0000-0000-000000000002';
  b record; n int;
begin
  select * into b from storage.buckets where id = 'photos';
  perform pg_temp.check(found and b.public = false, 'bucket photos exists and is private');
  perform pg_temp.check(b.file_size_limit = 5242880 and b.allowed_mime_types = array['image/*'],
    'bucket takes images up to 5 MB');

  perform pg_temp.act_as(admin_id);
  -- Admin uploads into the known folders, and records what each file is.
  insert into storage.objects (bucket_id, name) values
    ('photos', 'assets/a1/front.jpg'), ('photos', 'changes/CHG-0001/issue-1.jpg'),
    ('photos', 'faults/FLT-0001/1.jpg'), ('photos', 'handover/HO-0001/signed.jpg'),
    ('photos', 'service/SRV-0001/invoice.jpg');
  perform pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('photos', 'other/x.jpg')$q$,
    '%row-level security%', 'admin uploads only into the known folders');
  perform pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('photos', 'loose.jpg')$q$,
    '%row-level security%', 'no files at the top of the bucket');
  perform pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('photos', 'reports/x.jpg')$q$,
    '%row-level security%', 'reports/ is not open yet (Phase 3)');
  update storage.objects set name = 'assets/a1/back.jpg' where name = 'assets/a1/front.jpg';
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'admin cannot overwrite or rename a photo');
  delete from storage.objects where bucket_id = 'photos';
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'admin cannot delete a photo');

  insert into photos (entity_type, entity_id, kind, storage_path) values
    ('asset', 'a1', 'asset', 'assets/a1/front.jpg'),
    ('change_log', '1', 'issue', 'changes/CHG-0001/issue-1.jpg'),
    ('fault', '1', 'damage', 'faults/FLT-0001/1.jpg'),
    ('fault', '2', 'report', 'reports/0b6c-test.jpg'),
    ('handover_form', '1', 'signed_form', 'handover/HO-0001/signed.jpg'),
    ('service_job', '1', 'invoice', 'service/SRV-0001/invoice.jpg');
  perform pg_temp.check((select created_by from photos limit 1) = admin_id, 'photos record who added them');
  perform pg_temp.expect_error($q$insert into photos (entity_type, entity_id, kind, storage_path) values ('asset', 'a1', 'asset', 'faults/FLT-0001/1.jpg')$q$,
    '%photos_path_matches%', 'the path is in the folder for its entity');
  perform pg_temp.expect_error($q$insert into photos (entity_type, entity_id, kind, storage_path) values ('asset', 'a1', 'asset', 'assets/../faults/x.jpg')$q$,
    '%photos_path_matches%', 'no .. in a path');
  perform pg_temp.expect_error($q$insert into photos (entity_type, entity_id, kind, storage_path) values ('asset', 'a1', 'asset', 'assets/a1/')$q$,
    '%photos_path_matches%', 'a path names a file');
  perform pg_temp.expect_error($q$insert into photos (entity_type, entity_id, kind, storage_path) values ('asset', 'a1', 'selfie', 'assets/a1/z.jpg')$q$,
    '%photos_kind_check%', 'kind comes from the list');
  perform pg_temp.expect_error($q$insert into photos (entity_type, entity_id, kind, storage_path) values ('asset', 'a1', 'asset', 'assets/a1/front.jpg')$q$,
    '%duplicate key%', 'one row per file');
  perform pg_temp.expect_error($q$delete from photos$q$, '%permission denied%', 'photo rows are never deleted');
  perform pg_temp.expect_error($q$update photos set kind = 'damage'$q$, '%permission denied%', 'photo rows never change');
  reset role;

  -- Viewer reads, adds nothing.
  perform pg_temp.act_as(viewer_id);
  perform pg_temp.check((select count(*) from storage.objects where bucket_id = 'photos') = 5, 'viewer reads the files');
  perform pg_temp.check((select count(*) from photos) = 6, 'viewer reads the photo rows');
  perform pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('photos', 'assets/a1/v.jpg')$q$,
    '%row-level security%', 'viewer cannot upload');
  perform pg_temp.expect_error($q$insert into photos (entity_type, entity_id, kind, storage_path) values ('asset', 'a1', 'asset', 'assets/a1/v.jpg')$q$,
    '%row-level security%', 'viewer cannot add photo rows');
  reset role;

  -- Logged out: nothing at all.
  perform pg_temp.act_as(null);
  perform pg_temp.check((select count(*) from storage.objects) = 0, 'anon sees no files');
  perform pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('photos', 'assets/a1/anon.jpg')$q$,
    '%row-level security%', 'anon cannot upload');
  perform pg_temp.expect_error($q$select count(*) from photos$q$, '%permission denied%', 'anon reads no photo rows');
  reset role;

  -- A user with no profile: nothing either.
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000009', true);
  set local role authenticated;
  perform pg_temp.check((select count(*) from storage.objects) = 0, 'no profile, no files');
  perform pg_temp.check((select count(*) from photos) = 0, 'no profile, no photo rows');
  reset role;

  raise notice 'Photos: all checks passed.';
end;
$$;

rollback;
