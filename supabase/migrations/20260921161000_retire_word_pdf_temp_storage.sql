-- Retire the legacy Word/PDF server-conversion storage surface.
-- Browser Word → PDF and PDF → Word no longer upload user files to Supabase.
-- The bucket was verified empty before this migration was authored.

drop policy if exists "Allow Public Deletes 1bqrt77_0" on storage.objects;
drop policy if exists "Allow Public Deletes 1bqrt77_1" on storage.objects;
drop policy if exists "Allow Public Uploads 1bqrt77_0" on storage.objects;

-- Supabase protects direct storage-table deletion unless this transaction-local
-- guard is explicitly enabled. The bucket is empty and no active code uses it.
set local storage.allow_delete_query = 'true';

delete from storage.buckets
where id = 'lumeo-temp';
