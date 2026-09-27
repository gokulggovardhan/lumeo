begin;

alter table public.error_logs
  add column if not exists resolution_provenance text,
  add column if not exists verified_at timestamptz;

alter table public.error_logs
  drop constraint if exists error_logs_resolution_provenance_check;

alter table public.error_logs
  add constraint error_logs_resolution_provenance_check
  check (
    resolution_provenance is null
    or resolution_provenance in (
      'legacy_manual',
      'verified_fix',
      'automated_verified_fix'
    )
  );

comment on column public.error_logs.resolution_provenance is
  'How a resolved record reached resolved state. legacy_manual predates verified fix tracking; verified_fix was verified by an administrator; automated_verified_fix passed the recurrence-free production window automatically.';

comment on column public.error_logs.verified_at is
  'Timestamp when the fix completed its recurrence-free verification window. Null for unresolved records.';

-- Existing resolved rows predate fix-SHA verification. Keep their history but
-- label it honestly rather than implying they passed the new verification
-- lifecycle.
update public.error_logs
set
  resolution_provenance = 'legacy_manual',
  verified_at = coalesce(verified_at, resolved_at)
where status = 'resolved'
  and resolution_provenance is null;

create or replace function private.normalize_error_resolution_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'resolved' then
    new.resolution_provenance := null;
    new.verified_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists error_logs_resolution_metadata_guard
  on public.error_logs;

create trigger error_logs_resolution_metadata_guard
before insert or update on public.error_logs
for each row
execute function private.normalize_error_resolution_metadata();

create or replace function private.verify_matured_error_fixes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_count integer := 0;
begin
  update public.error_logs
  set
    status = 'resolved',
    resolved_at = now(),
    resolved_by = null,
    resolution_provenance = 'automated_verified_fix',
    verified_at = now()
  where status = 'fixed_pending_verification'
    and recurrence_after_fix = false
    and fix_deployed_at is not null
    and fix_deployed_at <= now() - interval '24 hours'
    and last_seen_at <= fix_deployed_at;

  get diagnostics verified_count = row_count;
  return verified_count;
end;
$$;

comment on function private.verify_matured_error_fixes() is
  'Resolves only fixes that have been deployed for at least 24 hours with no occurrence after deployment. Intended for the scheduled production verifier.';

commit;
