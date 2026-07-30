begin;

do $$
begin
  if to_regprocedure('public.get_admin_analytics_summary(date, date)') is null then
    raise exception 'Missing required function public.get_admin_analytics_summary(date, date). Run 20260719009_admin_analytics_unique_visitors.sql before 20260730001_admin_analytics_ist_daybounds.sql.';
  end if;
end;
$$;

-- Rebinds the admin analytics day boundary from the Postgres session's
-- default timezone (UTC on Supabase) to IST (Asia/Kolkata, UTC+5:30), so
-- "Today" and each day of the seven-day trend line up with the admin's
-- actual calendar day instead of rolling over at 5:30am IST. Everything
-- else in this function -- summary fields, top tools, error/device/browser/
-- os summaries -- is byte-for-byte unchanged from 20260719009.
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

  -- p_start_date/p_end_date are IST calendar dates (see lib/admin/data.ts).
  -- Interpret midnight-in-IST, not midnight-in-session-timezone, as the
  -- range boundary.
  range_start := p_start_date::timestamp at time zone 'Asia/Kolkata';
  range_end := (p_end_date + 1)::timestamp at time zone 'Asia/Kolkata';

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
    select
      events.event_name,
      -- IST calendar date for this event, not the session-timezone date.
      (events.occurred_at at time zone 'Asia/Kolkata')::date as event_date,
      events.anonymous_session_id
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

  return jsonb_build_object(
    'summary', summary,
    'daily_trend', daily_trend,
    'top_tools_by_opens', top_tools_by_opens,
    'top_tools_by_success', top_tools_by_success,
    'error_summary', error_summary,
    'device_summary', device_summary,
    'browser_summary', browser_summary,
    'operating_system_summary', os_summary
  );
end;
$$;

comment on function public.get_admin_analytics_summary(date, date) is
  'Returns aggregate-only analytics for active owners, admins, and analysts, including a distinct-session unique-visitor count. Day boundaries and per-day bucketing use IST (Asia/Kolkata), not the database session timezone. It prevents direct access to individual events, anonymous sessions, exact sizes, filenames, IPs, user agents, metadata, and document information.';

commit;
