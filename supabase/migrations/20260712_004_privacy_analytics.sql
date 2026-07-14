begin;

do $$
begin
  if to_regclass('public.analytics_events') is null then
    raise exception 'Missing required table public.analytics_events. Run 20260712_002_control_center_foundation.sql before this migration.';
  end if;

  if to_regclass('public.daily_tool_metrics') is null then
    raise exception 'Missing required table public.daily_tool_metrics. Run 20260712_002_control_center_foundation.sql before this migration.';
  end if;

  if to_regclass('public.pdf_tools') is null then
    raise exception 'Missing required table public.pdf_tools. Run 20260712_002_control_center_foundation.sql before this migration.';
  end if;

  if to_regclass('public.site_settings') is null then
    raise exception 'Missing required table public.site_settings. Run 20260712_002_control_center_foundation.sql before this migration.';
  end if;

  if to_regclass('public.admin_members') is null then
    raise exception 'Missing required table public.admin_members. Run 20260712_001_admin_members.sql before this migration.';
  end if;
end;
$$;

create or replace function public.get_public_analytics_setting()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(settings.value @> '{"enabled": true}'::jsonb, false)
  from public.site_settings as settings
  where settings.key = 'public_analytics_enabled'
    and settings.is_public = true
  limit 1;
$$;

comment on function public.get_public_analytics_setting() is
  'Returns only whether optional public analytics collection is enabled. It does not expose site_settings rows or values.';

create or replace function public.record_public_analytics_event(
  event_name text,
  tool_slug text default null,
  anonymous_session_id uuid default null,
  duration_ms integer default null,
  input_size_bucket text default null,
  output_size_bucket text default null,
  device_class text default 'unknown',
  browser_family text default 'unknown',
  operating_system text default 'unknown',
  success boolean default null,
  error_code text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_event text := lower(trim(record_public_analytics_event.event_name));
  cleaned_tool text := nullif(lower(trim(record_public_analytics_event.tool_slug)), '');
  cleaned_input_bucket text := coalesce(nullif(lower(trim(record_public_analytics_event.input_size_bucket)), ''), 'unknown');
  cleaned_output_bucket text := coalesce(nullif(lower(trim(record_public_analytics_event.output_size_bucket)), ''), 'unknown');
  cleaned_device text := coalesce(nullif(lower(trim(record_public_analytics_event.device_class)), ''), 'unknown');
  cleaned_browser text := coalesce(left(nullif(trim(record_public_analytics_event.browser_family), ''), 24), 'Unknown');
  cleaned_os text := coalesce(left(nullif(trim(record_public_analytics_event.operating_system), ''), 24), 'Unknown');
  cleaned_error text := nullif(lower(trim(record_public_analytics_event.error_code)), '');
  bounded_duration integer := null;
  inserted_id bigint;
  recent_count integer;
begin
  if cleaned_event not in ('page_view', 'tool_opened', 'processing_started', 'processing_succeeded', 'processing_failed', 'download_started') then
    raise exception 'Unsupported analytics event.';
  end if;

  if cleaned_tool is not null then
    if not exists (
      select 1
      from public.pdf_tools as tools
      where tools.slug = cleaned_tool
        and tools.is_enabled = true
        and tools.status in ('active', 'beta')
    ) then
      raise exception 'Unknown analytics tool.';
    end if;
  end if;

  if cleaned_event <> 'page_view' and cleaned_tool is null then
    raise exception 'Tool events require a tool slug.';
  end if;

  if cleaned_input_bucket not in ('under_1mb', '1mb_to_5mb', '5mb_to_20mb', '20mb_to_50mb', 'over_50mb', 'unknown') then
    cleaned_input_bucket := 'unknown';
  end if;

  if cleaned_output_bucket not in ('under_1mb', '1mb_to_5mb', '5mb_to_20mb', '20mb_to_50mb', 'over_50mb', 'unknown') then
    cleaned_output_bucket := 'unknown';
  end if;

  if cleaned_device not in ('desktop', 'tablet', 'mobile', 'unknown') then
    cleaned_device := 'unknown';
  end if;

  if cleaned_browser not in ('Chrome', 'Edge', 'Firefox', 'Safari', 'Other', 'Unknown') then
    cleaned_browser := 'Unknown';
  end if;

  if cleaned_os not in ('Windows', 'macOS', 'Linux', 'Android', 'iOS', 'Other', 'Unknown') then
    cleaned_os := 'Unknown';
  end if;

  if cleaned_error is not null and cleaned_error not in ('unsupported_file', 'file_too_large', 'invalid_pdf', 'processing_error', 'browser_limit', 'cancelled', 'unknown') then
    cleaned_error := 'unknown';
  end if;

  if record_public_analytics_event.duration_ms is not null then
    bounded_duration := greatest(0, least(record_public_analytics_event.duration_ms, 86400000));
  end if;

  if record_public_analytics_event.anonymous_session_id is not null then
    select count(*) into recent_count
    from public.analytics_events as events
    where events.anonymous_session_id = record_public_analytics_event.anonymous_session_id
      and events.occurred_at > now() - interval '1 minute';

    if recent_count >= 80 then
      raise exception 'Analytics rate limit reached.';
    end if;

    if exists (
      select 1
      from public.analytics_events as events
      where events.anonymous_session_id = record_public_analytics_event.anonymous_session_id
        and events.event_name = cleaned_event
        and coalesce(events.tool_slug, '') = coalesce(cleaned_tool, '')
        and events.occurred_at > now() - interval '3 seconds'
    ) then
      return 0;
    end if;
  else
    select count(*) into recent_count
    from public.analytics_events as events
    where events.anonymous_session_id is null
      and events.occurred_at > now() - interval '1 minute';

    if recent_count >= 25 then
      raise exception 'Analytics rate limit reached.';
    end if;
  end if;

  insert into public.analytics_events (
    event_name,
    tool_slug,
    anonymous_session_id,
    occurred_at,
    duration_ms,
    input_size_bucket,
    output_size_bucket,
    device_class,
    browser_family,
    operating_system,
    country_code,
    success,
    error_code
  )
  values (
    cleaned_event,
    cleaned_tool,
    record_public_analytics_event.anonymous_session_id,
    now(),
    bounded_duration,
    cleaned_input_bucket,
    cleaned_output_bucket,
    cleaned_device,
    cleaned_browser,
    cleaned_os,
    null,
    record_public_analytics_event.success,
    cleaned_error
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

comment on function public.record_public_analytics_event(text, text, uuid, integer, text, text, text, text, text, boolean, text) is
  'Records approved privacy-preserving public product events. Callers cannot provide timestamps, raw IPs, user IDs, emails, exact file sizes, filenames, metadata, or raw user-agent strings.';

create or replace function public.refresh_daily_tool_metrics(target_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_role text;
  updated_rows integer := 0;
begin
  admin_role := public.current_admin_role();
  if admin_role not in ('owner', 'admin') then
    raise exception 'Only active owners and admins may refresh analytics metrics.';
  end if;

  if target_date is null or target_date < date '2020-01-01' or target_date > current_date + 1 then
    raise exception 'Invalid metrics date.';
  end if;

  insert into public.daily_tool_metrics (
    metric_date,
    tool_slug,
    tool_opens,
    processing_started,
    processing_succeeded,
    processing_failed,
    total_duration_ms
  )
  select
    target_date,
    events.tool_slug,
    count(*) filter (where events.event_name = 'tool_opened'),
    count(*) filter (where events.event_name = 'processing_started'),
    count(*) filter (where events.event_name = 'processing_succeeded'),
    count(*) filter (where events.event_name = 'processing_failed'),
    coalesce(sum(events.duration_ms) filter (where events.event_name = 'processing_succeeded'), 0)
  from public.analytics_events as events
  where events.tool_slug is not null
    and events.occurred_at >= target_date::timestamptz
    and events.occurred_at < (target_date + 1)::timestamptz
  group by events.tool_slug
  on conflict (metric_date, tool_slug) do update set
    tool_opens = excluded.tool_opens,
    processing_started = excluded.processing_started,
    processing_succeeded = excluded.processing_succeeded,
    processing_failed = excluded.processing_failed,
    total_duration_ms = excluded.total_duration_ms;

  get diagnostics updated_rows = row_count;
  return updated_rows;
end;
$$;

comment on function public.refresh_daily_tool_metrics(date) is
  'Aggregates analytics_events into daily_tool_metrics for active owners/admins without exposing individual anonymous sessions.';

revoke all on function public.get_public_analytics_setting() from public;
revoke all on function public.record_public_analytics_event(text, text, uuid, integer, text, text, text, text, text, boolean, text) from public;
revoke all on function public.refresh_daily_tool_metrics(date) from public;

grant execute on function public.get_public_analytics_setting() to anon;
grant execute on function public.get_public_analytics_setting() to authenticated;
grant execute on function public.record_public_analytics_event(text, text, uuid, integer, text, text, text, text, text, boolean, text) to anon;
grant execute on function public.record_public_analytics_event(text, text, uuid, integer, text, text, text, text, text, boolean, text) to authenticated;
grant execute on function public.refresh_daily_tool_metrics(date) to authenticated;

commit;
