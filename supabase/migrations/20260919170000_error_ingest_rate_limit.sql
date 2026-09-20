begin;

-- Error-ingestion counters live outside the exposed Data API schema. The
-- public reporting RPC is the only supported entry point.
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table if not exists private.error_ingest_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null,
  event_count integer not null check (event_count >= 0)
);

create index if not exists error_ingest_rate_limits_window_idx
  on private.error_ingest_rate_limits (window_started_at);

revoke all on table private.error_ingest_rate_limits from public;
revoke all on table private.error_ingest_rate_limits from anon, authenticated;

-- Sanitize diagnostics before storage, not only when rendering Admin UI. This
-- protects the database even when a caller invokes the public RPC directly.
create or replace function private.sanitize_error_text(input_value text, max_chars integer)
returns text
language plpgsql
immutable
set search_path = ''
as $sanitize$
declare
  cleaned text;
begin
  if input_value is null then
    return null;
  end if;

  cleaned := input_value;
  cleaned := regexp_replace(cleaned, $re$(postgres|postgresql)://[^[:space:]/@:]+:[^[:space:]/@]+@$re$, E'\\1://[REDACTED]@', 'gi');
  cleaned := regexp_replace(cleaned, $re$Bearer[[:space:]]+[A-Za-z0-9._~+/=-]{8,}$re$, 'Bearer [REDACTED]', 'gi');
  cleaned := regexp_replace(cleaned, $re$eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$re$, '[REDACTED_JWT]', 'g');
  cleaned := regexp_replace(cleaned, $re$sb_secret_[A-Za-z0-9_-]+$re$, '[REDACTED_SUPABASE_SECRET]', 'g');
  cleaned := regexp_replace(cleaned, $re$(password|passwd|pwd|secret|token|api[_-]?key|authorization|cookie|set-cookie)([[:space:]]*[:=][[:space:]]*)[^[:space:],;]+$re$, E'\\1\\2[REDACTED]', 'gi');

  return left(cleaned, greatest(0, max_chars));
end;
$sanitize$;

revoke all on function private.sanitize_error_text(text, integer) from public;
revoke all on function private.sanitize_error_text(text, integer) from anon, authenticated;

-- Keep public error reporting available, but make rate limiting independent of
-- caller-supplied metadata. Authenticated requests are bucketed by auth.uid().
-- Anonymous requests use the supplied anonymous session when present, a
-- shared null-session bucket otherwise, and always consume a second global
-- anonymous bucket so rotating/omitting session IDs cannot make writes
-- unbounded.
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
set search_path = ''
as $$
declare
  cleaned_message text := private.sanitize_error_text(coalesce(nullif(btrim(record_error_event.message), ''), 'Unknown error'), 2000);
  cleaned_source text := case when record_error_event.source in ('client', 'server_action', 'route_handler', 'error_boundary', 'unhandled_rejection') then record_error_event.source else 'client' end;
  cleaned_severity text := case when record_error_event.severity in ('low', 'medium', 'high', 'critical') then record_error_event.severity else 'medium' end;
  cleaned_route text := left(nullif(btrim(record_error_event.route), ''), 300);
  cleaned_component text := left(nullif(btrim(record_error_event.component), ''), 200);
  cleaned_stack text := private.sanitize_error_text(record_error_event.stack, 4000);
  cleaned_page_url text := private.sanitize_error_text(nullif(btrim(record_error_event.page_url), ''), 500);
  actor_user_id uuid := auth.uid();
  actor_bucket text;
  accepted_count integer;
  computed_fingerprint text;
  inserted_id bigint;
  actor_limit constant integer := 40;
  anonymous_global_limit constant integer := 200;
  rate_window constant interval := interval '5 minutes';
begin
  actor_bucket := case
    when actor_user_id is not null then 'user:' || actor_user_id::text
    when record_error_event.anonymous_session_id is not null then 'session:' || record_error_event.anonymous_session_id::text
    else 'anon:null'
  end;

  -- Bound table growth while keeping the hot path indexed and deterministic.
  delete from private.error_ingest_rate_limits
  where window_started_at < now() - interval '1 day';

  accepted_count := null;
  insert into private.error_ingest_rate_limits as limits (
    bucket,
    window_started_at,
    event_count
  )
  values (actor_bucket, now(), 1)
  on conflict (bucket) do update
  set
    window_started_at = case
      when limits.window_started_at <= now() - rate_window then now()
      else limits.window_started_at
    end,
    event_count = case
      when limits.window_started_at <= now() - rate_window then 1
      else limits.event_count + 1
    end
  where
    limits.window_started_at <= now() - rate_window
    or limits.event_count < actor_limit
  returning event_count into accepted_count;

  if accepted_count is null then
    raise exception 'Error reporting rate limit reached.';
  end if;

  if actor_user_id is null then
    accepted_count := null;
    insert into private.error_ingest_rate_limits as limits (
      bucket,
      window_started_at,
      event_count
    )
    values ('anon:global', now(), 1)
    on conflict (bucket) do update
    set
      window_started_at = case
        when limits.window_started_at <= now() - rate_window then now()
        else limits.window_started_at
      end,
      event_count = case
        when limits.window_started_at <= now() - rate_window then 1
        else limits.event_count + 1
      end
    where
      limits.window_started_at <= now() - rate_window
      or limits.event_count < anonymous_global_limit
    returning event_count into accepted_count;

    if accepted_count is null then
      raise exception 'Error reporting rate limit reached.';
    end if;
  end if;

  computed_fingerprint := encode(
    extensions.digest(
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
    cleaned_stack, cleaned_route, cleaned_component,
    left(nullif(btrim(record_error_event.browser_family), ''), 40),
    left(nullif(btrim(record_error_event.operating_system), ''), 40),
    left(nullif(btrim(record_error_event.device_class), ''), 40),
    cleaned_page_url,
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
  'Public error capture with database-side per-actor and global anonymous rate limits. Fingerprints are computed server-side.';

revoke execute on function public.record_error_event(text, text, text, text, text, text, text, text, text, text, uuid, text, text) from public;
grant execute on function public.record_error_event(text, text, text, text, text, text, text, text, text, text, uuid, text, text) to anon, authenticated, service_role;

commit;
