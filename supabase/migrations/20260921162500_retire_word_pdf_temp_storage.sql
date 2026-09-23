-- Retire the dedicated scratch storage used by the former server-side
-- Word <-> PDF converter. Browser-side conversion no longer uploads user
-- documents to Supabase.
--
-- Fail closed if any object appears before this migration runs. Shared
-- Supabase auth, Admin, analytics, catalog, feedback, and other storage
-- surfaces are intentionally untouched.

do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'lumeo-temp'
  ) then
    raise exception 'Refusing to retire lumeo-temp: storage objects still exist';
  end if;
end
$$;

drop policy if exists "Allow Public Deletes 1bqrt77_0" on storage.objects;
drop policy if exists "Allow Public Deletes 1bqrt77_1" on storage.objects;
drop policy if exists "Allow Public Uploads 1bqrt77_0" on storage.objects;

set local storage.allow_delete_query = 'true';

delete from storage.buckets
where id = 'lumeo-temp';
