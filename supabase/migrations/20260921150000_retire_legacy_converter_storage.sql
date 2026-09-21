-- Retire the dedicated scratch storage used by the former server-side
-- Word <-> PDF converter. Browser-side conversion no longer uploads user
-- documents to Supabase. Fail closed if an unexpected object appears before
-- this migration runs; shared Supabase tables/auth/storage are untouched.

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

delete from storage.buckets
where id = 'lumeo-temp';
