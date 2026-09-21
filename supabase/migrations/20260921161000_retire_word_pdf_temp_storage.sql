-- Retire the legacy Word/PDF server-conversion storage surface.
-- Browser Word → PDF and PDF → Word no longer upload user files to Supabase.
-- The bucket was verified empty before this migration was authored.

drop policy if exists "Allow Public Deletes 1bqrt77_0" on storage.objects;
drop policy if exists "Allow Public Deletes 1bqrt77_1" on storage.objects;
drop policy if exists "Allow Public Uploads 1bqrt77_0" on storage.objects;

delete from storage.buckets
where id = 'lumeo-temp';
