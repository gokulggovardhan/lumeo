begin;

-- Analytics reconciliation upgrade:
-- - correlate processing lifecycle events server-side without changing every tool
-- - canonicalize one device/browser/OS bucket per verified visitor
-- - expose only reconciled processing attempts in primary Admin metrics
-- - keep historical uncorrelated lifecycle rows for diagnostics only
-- - keep all date boundaries in Asia/Kolkata

alter table public.analytics_events
  add column if not exists operation_attempt_id uuid;

create index if not exists analytics_events_operation_attempt_time_idx
  on public.analytics_events(operation_attempt_id, occurred_at)
  where analytics_schema_version = 2 and operation_attempt_id is not null;

create table if not exists private.analytics_active_attempts (
  session_key text not null,
  tool_slug text not null,
  operation_attempt_id uuid not null,
  started_at timestamptz not null default now(),
  primary key (session_key, tool_slug)
);

revoke all on table private.analytics_active_attempts from public, anon, authenticated;

create or replace function private.assign_analytics_operation_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_id uuid;
begin
  if new.analytics_schema_version <> 2
     or new.session_key is null
     or new.tool_slug is null
     or new.event_name not in (
       'processing_started',
       'processing_succeeded',
       'processing_failed',
       'processing_cancelled'
     ) then
    return new;
  end if;

  delete from private.analytics_active_attempts
  where started_at < now() - interval '2 hours';

  if new.event_name = 'processing_started' then
    attempt_id := extensions.gen_random_uuid();

    insert into private.analytics_active_attempts(
      session_key,
      tool_slug,
      operation_attempt_id,
      started_at
    )
    values (
      new.session_key,
      new.tool_slug,
      attempt_id,
      coalesce(new.occurred_at, now())
    )
    on conflict (session_key, tool_slug) do update
      set operation_attempt_id = excluded.operation_attempt_id,
          started_at = excluded.started_at;

    new.operation_attempt_id := attempt_id;
    return new;
  end if;

  select active.operation_attempt_id
  into attempt_id
  from private.analytics_active_attempts as active
  where active.session_key = new.session_key
    and active.tool_slug = new.tool_slug;

  new.operation_attempt_id := attempt_id;

  if attempt_id is not null then
    delete from private.analytics_active_attempts
    where session_key = new.session_key
      and tool_slug = new.tool_slug
      and operation_attempt_id = attempt_id;
  end if;

  return new;
end;
$$;

drop trigger if exists analytics_assign_operation_attempt
  on public.analytics_events;

create trigger analytics_assign_operation_attempt
before insert on public.analytics_events
for each row
execute function private.assign_analytics_operation_attempt();

create or replace function public.get_admin_verified_traffic_v3(
  p_start_date date,
  p_end_date date,
  p_traffic_scope text default 'real_audience'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  scope_name text := lower(trim(coalesce(p_traffic_scope, 'real_audience')));
  range_start timestamptz;
  range_end timestamptz;
  base jsonb;
  revised_summary jsonb;
  revised_daily jsonb;
  revised_integrity jsonb;
  device_summary jsonb;
  browser_summary jsonb;
  os_summary jsonb;
  error_summary jsonb;
  failure_stage_summary jsonb;
  cancellation_stage_summary jsonb;
  top_tools_success jsonb;
  correlated_started bigint := 0;
  correlated_succeeded bigint := 0;
  correlated_failed bigint := 0;
  correlated_cancelled bigint := 0;
  correlated_unfinished bigint := 0;
  successful_duration_ms bigint := null;
  uncorrelated_processing_events bigint := 0;
  orphan_terminal_attempts bigint := 0;
  environment_visitors bigint := 0;
  environment_device_total bigint := 0;
  environment_browser_total bigint := 0;
  environment_os_total bigint := 0;
  operation_correlation_cutover_at timestamptz := null;
  reconciliation_issue boolean := false;
begin
  base := public.get_admin_verified_traffic(
    p_start_date,
    p_end_date,
    scope_name
  );

  range_start := p_start_date::timestamp at time zone 'Asia/Kolkata';
  range_end := (p_end_date + 1)::timestamp at time zone 'Asia/Kolkata';

  -- Every verified visitor belongs to exactly one environment bucket in each
  -- dimension: the environment attached to their latest page view in-range.
  with population as materialized (
    select distinct on (e.visitor_key)
      e.visitor_key,
      coalesce(e.device_class, 'unknown') as device_class,
      coalesce(e.browser_family, 'Unknown') as browser_family,
      coalesce(e.operating_system, 'Unknown') as operating_system
    from public.analytics_events e
    where e.analytics_schema_version = 2
      and e.event_name = 'page_view'
      and e.visitor_key is not null
      and e.occurred_at >= range_start
      and e.occurred_at < range_end
      and (
        scope_name = 'all'
        or e.traffic_class = scope_name
        or (
          scope_name = 'automation'
          and e.traffic_class in ('known_bot', 'suspected_automation')
        )
      )
    order by e.visitor_key, e.occurred_at desc, e.id desc
  ),
  device_rows as (
    select device_class as label, count(*)::bigint as visitors
    from population
    group by device_class
    order by visitors desc, label
  ),
  browser_rows as (
    select browser_family as label, count(*)::bigint as visitors
    from population
    group by browser_family
    order by visitors desc, label
  ),
  os_rows as (
    select operating_system as label, count(*)::bigint as visitors
    from population
    group by operating_system
    order by visitors desc, label
  )
  select
    (select coalesce(jsonb_agg(to_jsonb(device_rows)), '[]'::jsonb) from device_rows),
    (select coalesce(jsonb_agg(to_jsonb(browser_rows)), '[]'::jsonb) from browser_rows),
    (select coalesce(jsonb_agg(to_jsonb(os_rows)), '[]'::jsonb) from os_rows),
    (select count(*)::bigint from population),
    (select coalesce(sum(visitors), 0)::bigint from device_rows),
    (select coalesce(sum(visitors), 0)::bigint from browser_rows),
    (select coalesce(sum(visitors), 0)::bigint from os_rows)
  into
    device_summary,
    browser_summary,
    os_summary,
    environment_visitors,
    environment_device_total,
    environment_browser_total,
    environment_os_total;

  -- The reporting population is attempts whose processing_started event is
  -- inside the selected IST range. A terminal outcome must carry the same
  -- server-assigned attempt UUID and also be inside the selected range.
  with scoped as materialized (
    select e.*
    from public.analytics_events e
    where e.analytics_schema_version = 2
      and e.occurred_at >= range_start
      and e.occurred_at < range_end
      and (
        scope_name = 'all'
        or e.traffic_class = scope_name
        or (
          scope_name = 'automation'
          and e.traffic_class in ('known_bot', 'suspected_automation')
        )
      )
  ),
  started as materialized (
    select distinct on (operation_attempt_id)
      operation_attempt_id,
      tool_slug,
      occurred_at as started_at
    from scoped
    where event_name = 'processing_started'
      and operation_attempt_id is not null
    order by operation_attempt_id, occurred_at asc, id asc
  ),
  terminal as materialized (
    select distinct on (operation_attempt_id)
      operation_attempt_id,
      event_name,
      duration_ms,
      error_code,
      failure_stage,
      occurred_at
    from scoped
    where event_name in (
      'processing_succeeded',
      'processing_failed',
      'processing_cancelled'
    )
      and operation_attempt_id is not null
    order by operation_attempt_id, occurred_at desc, id desc
  ),
  attempts as materialized (
    select
      started.operation_attempt_id,
      started.tool_slug,
      started.started_at,
      terminal.event_name as terminal_event,
      terminal.duration_ms,
      terminal.error_code,
      terminal.failure_stage,
      terminal.occurred_at as terminal_at
    from started
    left join terminal using (operation_attempt_id)
  ),
  lifecycle_counts as (
    select
      count(*)::bigint as started,
      count(*) filter (
        where terminal_event = 'processing_succeeded'
      )::bigint as succeeded,
      count(*) filter (
        where terminal_event = 'processing_failed'
      )::bigint as failed,
      count(*) filter (
        where terminal_event = 'processing_cancelled'
      )::bigint as cancelled,
      count(*) filter (
        where terminal_event is null
      )::bigint as unfinished,
      case
        when count(*) filter (
          where terminal_event = 'processing_succeeded'
            and duration_ms is not null
        ) > 0
        then round(avg(duration_ms) filter (
          where terminal_event = 'processing_succeeded'
            and duration_ms is not null
        ))::bigint
        else null
      end as average_successful_duration_ms
    from attempts
  ),
  failure_rows as (
    select coalesce(error_code, 'unknown') as label, count(*)::bigint as event_count
    from attempts
    where terminal_event = 'processing_failed'
    group by coalesce(error_code, 'unknown')
    order by event_count desc, label
  ),
  failure_stage_rows as (
    select coalesce(failure_stage, 'unknown') as label, count(*)::bigint as event_count
    from attempts
    where terminal_event = 'processing_failed'
    group by coalesce(failure_stage, 'unknown')
    order by event_count desc, label
  ),
  cancellation_stage_rows as (
    select coalesce(failure_stage, 'unknown') as label, count(*)::bigint as event_count
    from attempts
    where terminal_event = 'processing_cancelled'
    group by coalesce(failure_stage, 'unknown')
    order by event_count desc, label
  ),
  success_tool_rows as (
    select tool_slug, count(*)::bigint as event_count
    from attempts
    where terminal_event = 'processing_succeeded'
      and tool_slug is not null
    group by tool_slug
    order by event_count desc, tool_slug
    limit 15
  ),
  orphan as (
    select count(distinct terminal.operation_attempt_id)::bigint as event_count
    from terminal
    left join started using (operation_attempt_id)
    where started.operation_attempt_id is null
  ),
  uncorrelated as (
    select count(*)::bigint as event_count
    from scoped
    where event_name in (
      'processing_started',
      'processing_succeeded',
      'processing_failed',
      'processing_cancelled'
    )
      and operation_attempt_id is null
  )
  select
    lifecycle_counts.started,
    lifecycle_counts.succeeded,
    lifecycle_counts.failed,
    lifecycle_counts.cancelled,
    lifecycle_counts.unfinished,
    lifecycle_counts.average_successful_duration_ms,
    (select event_count from uncorrelated),
    (select event_count from orphan),
    (select coalesce(jsonb_agg(to_jsonb(failure_rows)), '[]'::jsonb) from failure_rows),
    (select coalesce(jsonb_agg(to_jsonb(failure_stage_rows)), '[]'::jsonb) from failure_stage_rows),
    (select coalesce(jsonb_agg(to_jsonb(cancellation_stage_rows)), '[]'::jsonb) from cancellation_stage_rows),
    (select coalesce(jsonb_agg(to_jsonb(success_tool_rows)), '[]'::jsonb) from success_tool_rows)
  into
    correlated_started,
    correlated_succeeded,
    correlated_failed,
    correlated_cancelled,
    correlated_unfinished,
    successful_duration_ms,
    uncorrelated_processing_events,
    orphan_terminal_attempts,
    error_summary,
    failure_stage_summary,
    cancellation_stage_summary,
    top_tools_success
  from lifecycle_counts;

  select min(e.occurred_at)
  into operation_correlation_cutover_at
  from public.analytics_events e
  where e.analytics_schema_version = 2
    and e.operation_attempt_id is not null;

  revised_summary :=
    (base -> 'summary')
    || jsonb_build_object(
      'processing_started', correlated_started,
      'processing_succeeded', correlated_succeeded,
      'processing_failed', correlated_failed,
      'processing_cancelled', correlated_cancelled,
      'unfinished_attempts', correlated_unfinished,
      'average_successful_duration_ms', successful_duration_ms
    );

  -- Keep each calendar day present, including zero-traffic days, but replace
  -- raw lifecycle event counts with correlated attempt counts.
  with day_counts as (
    select
      (started.started_at at time zone 'Asia/Kolkata')::date as day,
      count(*)::bigint as processing_started,
      count(*) filter (
        where terminal.event_name = 'processing_succeeded'
      )::bigint as processing_succeeded,
      count(*) filter (
        where terminal.event_name = 'processing_failed'
      )::bigint as processing_failed,
      count(*) filter (
        where terminal.event_name = 'processing_cancelled'
      )::bigint as processing_cancelled,
      count(*) filter (
        where terminal.event_name is null
      )::bigint as unfinished_attempts
    from (
      select distinct on (e.operation_attempt_id)
        e.operation_attempt_id,
        e.occurred_at as started_at
      from public.analytics_events e
      where e.analytics_schema_version = 2
        and e.event_name = 'processing_started'
        and e.operation_attempt_id is not null
        and e.occurred_at >= range_start
        and e.occurred_at < range_end
        and (
          scope_name = 'all'
          or e.traffic_class = scope_name
          or (
            scope_name = 'automation'
            and e.traffic_class in ('known_bot', 'suspected_automation')
          )
        )
      order by e.operation_attempt_id, e.occurred_at asc, e.id asc
    ) started
    left join lateral (
      select e.event_name
      from public.analytics_events e
      where e.analytics_schema_version = 2
        and e.operation_attempt_id = started.operation_attempt_id
        and e.event_name in (
          'processing_succeeded',
          'processing_failed',
          'processing_cancelled'
        )
        and e.occurred_at >= range_start
        and e.occurred_at < range_end
        and (
          scope_name = 'all'
          or e.traffic_class = scope_name
          or (
            scope_name = 'automation'
            and e.traffic_class in ('known_bot', 'suspected_automation')
          )
        )
      order by e.occurred_at desc, e.id desc
      limit 1
    ) terminal on true
    group by 1
  ),
  base_days as (
    select value as day_json
    from jsonb_array_elements(base -> 'daily')
  )
  select coalesce(
    jsonb_agg(
      day_json || jsonb_build_object(
        'processing_started', coalesce(day_counts.processing_started, 0),
        'processing_succeeded', coalesce(day_counts.processing_succeeded, 0),
        'processing_failed', coalesce(day_counts.processing_failed, 0),
        'processing_cancelled', coalesce(day_counts.processing_cancelled, 0),
        'unfinished_attempts', coalesce(day_counts.unfinished_attempts, 0)
      )
      order by (day_json ->> 'date')::date
    ),
    '[]'::jsonb
  )
  into revised_daily
  from base_days
  left join day_counts
    on day_counts.day = (day_json ->> 'date')::date;

  reconciliation_issue :=
    environment_visitors <> coalesce((base #>> '{summary,unique_visitors}')::bigint, 0)
    or environment_device_total <> environment_visitors
    or environment_browser_total <> environment_visitors
    or environment_os_total <> environment_visitors
    or correlated_started <> (
      correlated_succeeded
      + correlated_failed
      + correlated_cancelled
      + correlated_unfinished
    )
    or orphan_terminal_attempts > 0
    or uncorrelated_processing_events > 0;

  revised_integrity :=
    (base -> 'integrity')
    || jsonb_build_object(
      'environment_visitors', environment_visitors,
      'environment_device_total', environment_device_total,
      'environment_browser_total', environment_browser_total,
      'environment_os_total', environment_os_total,
      'uncorrelated_processing_events', uncorrelated_processing_events,
      'orphan_terminal_attempts', orphan_terminal_attempts,
      'operation_correlation_cutover_at', operation_correlation_cutover_at,
      'lifecycle_reconciles',
        correlated_started = (
          correlated_succeeded
          + correlated_failed
          + correlated_cancelled
          + correlated_unfinished
        ),
      'environment_reconciles',
        environment_device_total = environment_visitors
        and environment_browser_total = environment_visitors
        and environment_os_total = environment_visitors
        and environment_visitors = coalesce(
          (base #>> '{summary,unique_visitors}')::bigint,
          0
        ),
      'reconciliation_issue', reconciliation_issue
    );

  return
    base
    || jsonb_build_object(
      'as_of', now(),
      'summary', revised_summary,
      'daily', revised_daily,
      'device_summary', device_summary,
      'browser_summary', browser_summary,
      'operating_system_summary', os_summary,
      'top_tools_by_success', top_tools_success,
      'error_summary', error_summary,
      'failure_stage_summary', failure_stage_summary,
      'cancellation_stage_summary', cancellation_stage_summary,
      'integrity', revised_integrity
    );
end;
$$;

revoke all on function public.get_admin_verified_traffic_v3(date, date, text)
  from public, anon;
grant execute on function public.get_admin_verified_traffic_v3(date, date, text)
  to authenticated;

create or replace function public.get_admin_recent_operational_events_v3(
  p_limit integer default 40
)
returns table (
  occurred_at timestamptz,
  event_name text,
  tool_slug text,
  traffic_class text,
  device_class text,
  browser_family text,
  operating_system text,
  city text,
  region text,
  region_code text,
  country_code text,
  geo_precision text,
  page_path text,
  acquisition_source text,
  success boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  admin_role text;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 40), 50));
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  admin_role := public.current_admin_role();
  if admin_role not in ('owner', 'admin', 'analyst')
     or not public.is_active_admin() then
    raise exception 'Active administrator access required.';
  end if;

  return query
  select
    e.occurred_at,
    e.event_name,
    e.tool_slug,
    e.traffic_class,
    e.device_class,
    e.browser_family,
    e.operating_system,
    e.city,
    e.region,
    e.region_code,
    e.country_code,
    e.geo_precision,
    e.page_path,
    e.acquisition_source,
    e.success
  from public.analytics_events e
  where e.analytics_schema_version = 2
    and e.traffic_class = 'real_audience'
    and e.event_name in (
      'tool_opened',
      'processing_started',
      'processing_succeeded',
      'processing_failed',
      'processing_cancelled',
      'download_started'
    )
  order by e.occurred_at desc, e.id desc
  limit safe_limit;
end;
$$;

revoke all on function public.get_admin_recent_operational_events_v3(integer)
  from public, anon;
grant execute on function public.get_admin_recent_operational_events_v3(integer)
  to authenticated;

comment on column public.analytics_events.operation_attempt_id is
  'Server-assigned random UUID used only to reconcile one processing_started event with its terminal processing outcome. It contains no user or document data.';

comment on function public.get_admin_verified_traffic_v3(date, date, text) is
  'Returns verified analytics with canonical per-visitor environment counts and correlated processing-attempt lifecycle metrics. Schema-v1 rows never enter business metrics.';

comment on function public.get_admin_recent_operational_events_v3(integer) is
  'Returns only recent verified Real Audience operational events, excluding page_view events already shown in Live Traffic.';

commit;
