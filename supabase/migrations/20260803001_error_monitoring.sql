begin;

do $$
begin
  if to_regclass('public.audit_logs') is null then
    raise exception 'Missing required table public.audit_logs. Run 20260712002_control_center_foundation.sql before 20260803001_error_monitoring.sql.';
  end if;
end;
$$;

-- Client/server error capture. Errors are deduplicated by fingerprint
-- (route + component + a truncated, normalized message) so a single
-- recurring bug produces one row with a rising occurrence_count, not
-- thousands of near-identical rows.
create table if not exists public.error_logs (
  id bigint generated always as identity primary key,
  fingerprint text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  source text not null default 'client' check (source in ('client', 'server_action', 'route_handler', 'error_boundary', 'unhandled_rejection')),
  message text not null,
  stack text,
  route text,
  component text,
  browser_family text,
  operating_system text,
  device_class text,
  page_url text,
  anonymous_session_id uuid,
  build_version text,
  git_sha text,
  occurrence_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create unique index if not exists error_logs_fingerprint_key on public.error_logs (fingerprint);
create index if not exists error_logs_status_idx on public.error_logs (status);
create index if not exists error_logs_severity_idx on public.error_logs (severity);
create index if not exists error_logs_last_seen_at_idx on public.error_logs (last_seen_at desc);

alter table public.error_logs enable row level security;

drop policy if exists "Admins can read error logs" on public.error_logs;
create policy "Admins can read error logs" on public.error_logs for select to authenticated using (public.is_active_admin());
drop policy if exists "Content admins can update error logs" on public.error_logs;
create policy "Content admins can update error logs" on public.error_logs for update to authenticated using (public.can_manage_content()) with check (public.can_manage_content());

-- Anonymous, rate-limited capture RPC. Fingerprint is computed here (never
-- trusted from the caller) so dedup integrity can't be bypassed client-side.
-- Mirrors the rate-limit shape already used by record_public_analytics_event.
create or replace function public.record_error_event(
  message text,
  stack text default null,
  route text default null,
  component text default null,
  source text default 'client',
  severity text default 'medium',
  browser_family text default null,
  operating_system text default null,
  device_class text default null,
  page_url text default null,
  anonymous_session_id uuid default null,
  build_version text default null,
  git_sha text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  cleaned_message text := left(coalesce(nullif(btrim(record_error_event.message), ''), 'Unknown error'), 2000);
  cleaned_source text := case when record_error_event.source in ('client', 'server_action', 'route_handler', 'error_boundary', 'unhandled_rejection') then record_error_event.source else 'client' end;
  cleaned_severity text := case when record_error_event.severity in ('low', 'medium', 'high', 'critical') then record_error_event.severity else 'medium' end;
  cleaned_route text := left(nullif(btrim(record_error_event.route), ''), 300);
  cleaned_component text := left(nullif(btrim(record_error_event.component), ''), 200);
  computed_fingerprint text;
  recent_count integer;
  inserted_id bigint;
begin
  if record_error_event.anonymous_session_id is not null then
    select count(*) into recent_count
    from public.error_logs
    where error_logs.anonymous_session_id = record_error_event.anonymous_session_id
      and error_logs.first_seen_at > now() - interval '5 minutes';

    if recent_count >= 40 then
      raise exception 'Error reporting rate limit reached.';
    end if;
  end if;

  computed_fingerprint := encode(
    digest(
      coalesce(cleaned_route, '') || '|' || coalesce(cleaned_component, '') || '|' || left(cleaned_message, 200),
      'sha256'
    ),
    'hex'
  );

  insert into public.error_logs (
    fingerprint, severity, source, message, stack, route, component,
    browser_family, operating_system, device_class, page_url,
    anonymous_session_id, build_version, git_sha
  )
  values (
    computed_fingerprint, cleaned_severity, cleaned_source, cleaned_message,
    left(record_error_event.stack, 4000), cleaned_route, cleaned_component,
    left(nullif(btrim(record_error_event.browser_family), ''), 40),
    left(nullif(btrim(record_error_event.operating_system), ''), 40),
    left(nullif(btrim(record_error_event.device_class), ''), 40),
    left(nullif(btrim(record_error_event.page_url), ''), 500),
    record_error_event.anonymous_session_id,
    left(nullif(btrim(record_error_event.build_version), ''), 40),
    left(nullif(btrim(record_error_event.git_sha), ''), 40)
  )
  on conflict (fingerprint) do update set
    occurrence_count = public.error_logs.occurrence_count + 1,
    last_seen_at = now(),
    stack = coalesce(excluded.stack, public.error_logs.stack),
    page_url = coalesce(excluded.page_url, public.error_logs.page_url)
  returning id into inserted_id;

  return inserted_id;
end;
$$;

comment on function public.record_error_event(text, text, text, text, text, text, text, text, text, text, uuid, text, text) is
  'Anonymous, rate-limited error capture. Fingerprint is computed server-side for dedup integrity. Never raises to the caller''s advantage beyond the rate-limit exception.';

revoke all on function public.record_error_event(text, text, text, text, text, text, text, text, text, text, uuid, text, text) from public;
grant execute on function public.record_error_event(text, text, text, text, text, text, text, text, text, text, uuid, text, text) to anon, authenticated;

commit;
