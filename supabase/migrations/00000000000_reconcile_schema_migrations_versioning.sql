begin;

-- All prior migration files were named "<date>_<NNN>_name.sql" (e.g.
-- 20260712_001_admin_members.sql). The Supabase CLI derives a migration's
-- version from the leading run of digits in its filename, stopping at the
-- first non-digit character -- so every file sharing a date collapsed to
-- the same version (e.g. both 20260712_001_... and 20260712_002_... became
-- version "20260712"). The first push of a two-migration day succeeded and
-- recorded that shared version; the second then hit a duplicate-key error
-- on supabase_migrations.schema_migrations and the whole push aborted. This
-- had silently blocked every migration push since it was first introduced
-- (unrelated network issues masked it further, see PR history).
--
-- Fix: all migration files were renamed to "<date><NNN>_name.sql" so each
-- has a unique, monotonically increasing version. This migration (version
-- "00000000000", sorted before all of them) clears the one bad bookkeeping
-- row left behind by a prior partial push, so the renamed files below are
-- re-applied cleanly and recorded under their correct, unique versions. The
-- underlying schema objects are unaffected -- every migration in this
-- directory guards its DDL against already-existing objects (see the
-- "already exists, skipping" NOTICEs any re-run produces), so replaying
-- them is a safe no-op at the schema level.
delete from supabase_migrations.schema_migrations
where version = '20260712';

commit;
