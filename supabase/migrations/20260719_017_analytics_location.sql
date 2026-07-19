begin;

do $$
begin
  if to_regclass('public.analytics_events') is null then
    raise exception 'Missing required table public.analytics_events. Run 20260712_004_privacy_analytics.sql first.';
  end if;

  if to_regprocedure('public.record_public_analytics_event(text, text, uuid, integer, text, text, text, text, text, boolean, text)') is null then
    raise exception 'Missing expected signature of public.record_public_analytics_event(). Run 20260712_004_privacy_analytics.sql first.';
  end if;
end;
$$;

-- analytics_events already had a country_code column that nothing ever
-- populated (the recording RPC didn't accept it as a parameter). Adds city
-- and region alongside it, city/region/country-code only -- never an IP
-- address or precise coordinates -- matching the same privacy scope as the
-- feedback widget's location field.
alter table public.analytics_events
  add column if not exists region text;

alter table public.analytics_events
  add column if not exists city text;

-- Adding trailing parameters via CREATE OR REPLACE would NOT replace the
-- existing 11-argument function -- Postgres identifies a function by name
-- + parameter type list, so a 14-argument version is a distinct overload,
-- not a replacement. Left as two overloads, PostgREST can throw "Could not
-- choose the best candidate function" on calls where the named arguments
-- given are ambiguous between them. Drop the old signature explicitly first
-- so only one version of this function ever exists.
drop function if exists public.record_public_analytics_event(text, text, uuid, integer, text, text, text, text, text, boolean, text);

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
  error_code text default null,
  country_code text default null,
  region text default null,
  city text default null
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
  cleaned_country text := nullif(upper(left(trim(record_public_analytics_event.country_code), 3)), '');
  cleaned_region text := nullif(left(trim(record_public_analytics_event.region), 100), '');
  cleaned_city text := nullif(left(trim(record_public_analytics_event.city), 100), '');
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
    region,
    city,
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
    cleaned_country,
    cleaned_region,
    cleaned_city,
    record_public_analytics_event.success,
    cleaned_error
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

comment on function public.record_public_analytics_event(text, text, uuid, integer, text, text, text, text, text, boolean, text, text, text, text) is
  'Records approved privacy-preserving public product events, including approximate city/region/country derived from Vercel edge geolocation. Callers cannot provide timestamps, raw IPs, precise coordinates, user IDs, emails, exact file sizes, filenames, metadata, or raw user-agent strings.';

revoke all on function public.record_public_analytics_event(text, text, uuid, integer, text, text, text, text, text, boolean, text, text, text, text) from public;
grant execute on function public.record_public_analytics_event(text, text, uuid, integer, text, text, text, text, text, boolean, text, text, text, text) to anon;
grant execute on function public.record_public_analytics_event(text, text, uuid, integer, text, text, text, text, text, boolean, text, text, text, text) to authenticated;

-- Adds a "top locations" breakdown (city, region, country_code -- same three
-- fields as everywhere else in this feature) to the admin analytics
-- summary. Parameter list is unchanged from 009, so this is a genuine
-- in-place replace, not an overload.
create or replace function public.get_admin_analytics_summary(
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_role text;
  range_start timestamptz;
  range_end timestamptz;
  summary jsonb;
  daily_trend jsonb;
  top_tools_by_opens jsonb;
  top_tools_by_success jsonb;
  error_summary jsonb;
  device_summary jsonb;
  browser_summary jsonb;
  os_summary jsonb;
  location_summary jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  admin_role := public.current_admin_role();
  if admin_role not in ('owner', 'admin', 'analyst') or not public.is_active_admin() then
    raise exception 'Active administrator access required.';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'Analytics date range is required.';
  end if;

  if p_end_date < p_start_date then
    raise exception 'Analytics end date cannot be before start date.';
  end if;

  if p_end_date - p_start_date > 89 then
    raise exception 'Analytics date range cannot exceed 90 days.';
  end if;

  range_start := p_start_date::timestamptz;
  range_end := (p_end_date + 1)::timestamptz;

  with scoped_events as (
    select
      events.event_name,
      events.tool_slug,
      events.occurred_at,
      events.duration_ms,
      events.device_class,
      events.browser_family,
      events.operating_system,
      events.error_code,
      events.anonymous_session_id
    from public.analytics_events as events
    where events.occurred_at >= range_start
      and events.occurred_at < range_end
  )
  select jsonb_build_object(
    'total_events', count(*)::bigint,
    'unique_visitors', count(distinct scoped_events.anonymous_session_id)::bigint,
    'tool_opens', count(*) filter (where scoped_events.event_name = 'tool_opened')::bigint,
    'processing_started', count(*) filter (where scoped_events.event_name = 'processing_started')::bigint,
    'processing_succeeded', count(*) filter (where scoped_events.event_name = 'processing_succeeded')::bigint,
    'processing_failed', count(*) filter (where scoped_events.event_name = 'processing_failed')::bigint,
    'downloads_started', count(*) filter (where scoped_events.event_name = 'download_started')::bigint,
    'successful_duration_total_ms', coalesce(sum(scoped_events.duration_ms) filter (where scoped_events.event_name = 'processing_succeeded'), 0)::bigint,
    'average_successful_duration_ms',
      case
        when count(*) filter (where scoped_events.event_name = 'processing_succeeded' and scoped_events.duration_ms is not null) > 0
          then round(avg(scoped_events.duration_ms) filter (where scoped_events.event_name = 'processing_succeeded' and scoped_events.duration_ms is not null))::bigint
        else null
      end,
    'latest_event_at', max(scoped_events.occurred_at)
  )
  into summary
  from scoped_events;

  with days as (
    select generate_series(p_start_date, p_end_date, interval '1 day')::date as metric_date
  ),
  scoped_events as (
    select events.event_name, events.occurred_at::date as event_date, events.anonymous_session_id
    from public.analytics_events as events
    where events.occurred_at >= range_start
      and events.occurred_at < range_end
  ),
  daily_rows as (
    select
      days.metric_date,
      coalesce(count(scoped_events.event_name), 0)::bigint as total_events,
      coalesce(count(distinct scoped_events.anonymous_session_id), 0)::bigint as unique_visitors,
      coalesce(count(scoped_events.event_name) filter (where scoped_events.event_name = 'tool_opened'), 0)::bigint as tool_opens,
      coalesce(count(scoped_events.event_name) filter (where scoped_events.event_name = 'processing_started'), 0)::bigint as processing_started,
      coalesce(count(scoped_events.event_name) filter (where scoped_events.event_name = 'processing_succeeded'), 0)::bigint as processing_succeeded,
      coalesce(count(scoped_events.event_name) filter (where scoped_events.event_name = 'processing_failed'), 0)::bigint as processing_failed,
      coalesce(count(scoped_events.event_name) filter (where scoped_events.event_name = 'download_started'), 0)::bigint as downloads_started
    from days
    left join scoped_events on scoped_events.event_date = days.metric_date
    group by days.metric_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', daily_rows.metric_date,
    'total_events', daily_rows.total_events,
    'unique_visitors', daily_rows.unique_visitors,
    'tool_opens', daily_rows.tool_opens,
    'processing_started', daily_rows.processing_started,
    'processing_succeeded', daily_rows.processing_succeeded,
    'processing_failed', daily_rows.processing_failed,
    'downloads_started', daily_rows.downloads_started
  ) order by daily_rows.metric_date), '[]'::jsonb)
  into daily_trend
  from daily_rows;

  with grouped as (
    select events.tool_slug, count(*)::bigint as event_count
    from public.analytics_events as events
    where events.occurred_at >= range_start
      and events.occurred_at < range_end
      and events.event_name = 'tool_opened'
      and events.tool_slug is not null
    group by events.tool_slug
    order by event_count desc, events.tool_slug asc
    limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object('tool_slug', grouped.tool_slug, 'event_count', grouped.event_count)), '[]'::jsonb)
  into top_tools_by_opens
  from grouped;

  with grouped as (
    select events.tool_slug, count(*)::bigint as event_count
    from public.analytics_events as events
    where events.occurred_at >= range_start
      and events.occurred_at < range_end
      and events.event_name = 'processing_succeeded'
      and events.tool_slug is not null
    group by events.tool_slug
    order by event_count desc, events.tool_slug asc
    limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object('tool_slug', grouped.tool_slug, 'event_count', grouped.event_count)), '[]'::jsonb)
  into top_tools_by_success
  from grouped;

  with grouped as (
    select coalesce(events.error_code, 'unknown') as error_code, count(*)::bigint as event_count
    from public.analytics_events as events
    where events.occurred_at >= range_start
      and events.occurred_at < range_end
      and events.event_name = 'processing_failed'
    group by coalesce(events.error_code, 'unknown')
    order by event_count desc, error_code asc
    limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object('error_code', grouped.error_code, 'event_count', grouped.event_count)), '[]'::jsonb)
  into error_summary
  from grouped;

  with grouped as (
    select coalesce(events.device_class, 'unknown') as device_class, count(*)::bigint as event_count
    from public.analytics_events as events
    where events.occurred_at >= range_start
      and events.occurred_at < range_end
    group by coalesce(events.device_class, 'unknown')
    order by event_count desc, device_class asc
  )
  select coalesce(jsonb_agg(jsonb_build_object('device_class', grouped.device_class, 'event_count', grouped.event_count)), '[]'::jsonb)
  into device_summary
  from grouped;

  with grouped as (
    select coalesce(events.browser_family, 'Unknown') as browser_family, count(*)::bigint as event_count
    from public.analytics_events as events
    where events.occurred_at >= range_start
      and events.occurred_at < range_end
    group by coalesce(events.browser_family, 'Unknown')
    order by event_count desc, browser_family asc
  )
  select coalesce(jsonb_agg(jsonb_build_object('browser_family', grouped.browser_family, 'event_count', grouped.event_count)), '[]'::jsonb)
  into browser_summary
  from grouped;

  with grouped as (
    select coalesce(events.operating_system, 'Unknown') as operating_system, count(*)::bigint as event_count
    from public.analytics_events as events
    where events.occurred_at >= range_start
      and events.occurred_at < range_end
    group by coalesce(events.operating_system, 'Unknown')
    order by event_count desc, operating_system asc
  )
  select coalesce(jsonb_agg(jsonb_build_object('operating_system', grouped.operating_system, 'event_count', grouped.event_count)), '[]'::jsonb)
  into os_summary
  from grouped;

  -- Grouped by the full city+region+country combination so "Springfield, IL,
  -- US" and "Springfield, MO, US" never collapse into one row. Distinct
  -- visitors, not raw event count, so one person refreshing repeatedly
  -- doesn't inflate their city's rank.
  with grouped as (
    select
      events.city,
      events.region,
      events.country_code,
      count(distinct events.anonymous_session_id)::bigint as visitor_count
    from public.analytics_events as events
    where events.occurred_at >= range_start
      and events.occurred_at < range_end
      and (events.city is not null or events.region is not null or events.country_code is not null)
    group by events.city, events.region, events.country_code
    order by visitor_count desc
    limit 15
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'city', grouped.city,
    'region', grouped.region,
    'country_code', grouped.country_code,
    'visitor_count', grouped.visitor_count
  )), '[]'::jsonb)
  into location_summary
  from grouped;

  return jsonb_build_object(
    'summary', summary,
    'daily_trend', daily_trend,
    'top_tools_by_opens', top_tools_by_opens,
    'top_tools_by_success', top_tools_by_success,
    'error_summary', error_summary,
    'device_summary', device_summary,
    'browser_summary', browser_summary,
    'operating_system_summary', os_summary,
    'location_summary', location_summary
  );
end;
$$;

comment on function public.get_admin_analytics_summary(date, date) is
  'Returns aggregate-only analytics for active owners, admins, and analysts, including a distinct-session unique-visitor count and a top-locations breakdown. It prevents direct access to individual events, anonymous sessions, exact sizes, filenames, IPs, user agents, metadata, and document information.';

revoke all on function public.get_admin_analytics_summary(date, date) from public;
revoke all on function public.get_admin_analytics_summary(date, date) from anon;
revoke all on function public.get_admin_analytics_summary(date, date) from authenticated;
grant execute on function public.get_admin_analytics_summary(date, date) to authenticated;

commit;
