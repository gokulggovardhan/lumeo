begin;

alter table public.error_logs
  add column if not exists last_fix_sha text,
  add column if not exists fix_deployed_at timestamptz,
  add column if not exists recurrence_after_fix boolean not null default false;

alter table public.error_logs
  drop constraint if exists error_logs_status_check;

alter table public.error_logs
  add constraint error_logs_status_check
  check (status in ('open', 'acknowledged', 'fixed_pending_verification', 'resolved', 'ignored'));

-- A historical manual resolution that was followed by another occurrence is
-- not resolved in reality. Preserve the record/history but reopen it.
update public.error_logs
set
  status = 'open',
  resolved_at = null,
  resolved_by = null,
  recurrence_after_fix = true
where status = 'resolved'
  and resolved_at is not null
  and last_seen_at > resolved_at;

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
  cleaned_page_url text := private.sanitize_error_text(
    split_part(split_part(nullif(btrim(record_error_event.page_url), ''), '?', 1), '#', 1),
    500
  );
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
    page_url = coalesce(excluded.page_url, public.error_logs.page_url),
    build_version = coalesce(excluded.build_version, public.error_logs.build_version),
    git_sha = coalesce(excluded.git_sha, public.error_logs.git_sha),
    browser_family = coalesce(excluded.browser_family, public.error_logs.browser_family),
    operating_system = coalesce(excluded.operating_system, public.error_logs.operating_system),
    device_class = coalesce(excluded.device_class, public.error_logs.device_class),
    status = case
      when public.error_logs.status in ('resolved', 'fixed_pending_verification')
        then 'open'
      else public.error_logs.status
    end,
    recurrence_after_fix = case
      when public.error_logs.status in ('resolved', 'fixed_pending_verification')
        then true
      else public.error_logs.recurrence_after_fix
    end,
    resolved_at = case
      when public.error_logs.status in ('resolved', 'fixed_pending_verification')
        then null
      else public.error_logs.resolved_at
    end,
    resolved_by = case
      when public.error_logs.status in ('resolved', 'fixed_pending_verification')
        then null
      else public.error_logs.resolved_by
    end
  returning id into inserted_id;

  return inserted_id;
end;
$$;

comment on function public.record_error_event(text, text, text, text, text, text, text, text, text, text, uuid, text, text) is
  'Public error capture with server-side fingerprinting/rate limits. A recurrence automatically reopens resolved or fixed-pending records and records the latest build/environment dimensions.';

commit;
