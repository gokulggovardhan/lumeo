-- Retire the Supabase Storage scratch bucket used exclusively by the former
-- server-assisted Word → PDF / PDF → Word conversion pipeline.
--
-- Safety:
-- - Browser Word/PDF conversion no longer uploads document bytes to Supabase.
-- - The production conversion gate rejects any non-GET Supabase Storage
--   transport from the live Word/PDF/HTML conversion flows.
-- - Historical Git commits attribute this bucket and these policies directly
--   to the retired converter.
-- - Refuse to delete the bucket if an object appears before this migration is
--   applied, so unexpected reuse cannot cause data loss.

do $$
declare
  object_count bigint;
  unexpected_policy_count integer;
begin
  select count(*)
  into object_count
  from storage.objects
  where bucket_id = 'lumeo-temp';

  if object_count <> 0 then
    raise exception
      'Refusing to retire lumeo-temp: % storage object(s) still exist.',
      object_count;
  end if;

  select count(*)
  into unexpected_policy_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and (
      coalesce(qual, '') like '%lumeo-temp%'
      or coalesce(with_check, '') like '%lumeo-temp%'
    )
    and policyname not in (
      'Allow Public Deletes 1bqrt77_0',
      'Allow Public Deletes 1bqrt77_1',
      'Allow Public Uploads 1bqrt77_0'
    );

  if unexpected_policy_count <> 0 then
    raise exception
      'Refusing to retire lumeo-temp: % unexpected storage policy/policies reference the bucket.',
      unexpected_policy_count;
  end if;
end
$$;

drop policy if exists "Allow Public Deletes 1bqrt77_0" on storage.objects;
drop policy if exists "Allow Public Deletes 1bqrt77_1" on storage.objects;
drop policy if exists "Allow Public Uploads 1bqrt77_0" on storage.objects;

-- Supabase protects storage metadata from ordinary direct deletion. The
-- Storage service itself opts into deletion with this transaction-local
-- setting. We do the same only after the empty-bucket and policy guards above.
select set_config('storage.allow_delete_query', 'true', true);

delete from storage.buckets
where id = 'lumeo-temp';
