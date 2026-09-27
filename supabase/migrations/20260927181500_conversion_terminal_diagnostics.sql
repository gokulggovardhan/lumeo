begin;

alter table public.analytics_events
  add column if not exists failure_stage text;

alter table public.analytics_events
  drop constraint if exists analytics_events_failure_stage_check;

alter table public.analytics_events
  add constraint analytics_events_failure_stage_check
  check (
    failure_stage is null
    or failure_stage in (
      'preparing',
      'loading-engine',
      'converting',
      'generating',
      'validating',
      'finalizing',
      'unknown'
    )
  );

comment on column public.analytics_events.failure_stage is
  'Privacy-safe conversion lifecycle stage for processing_failed or processing_cancelled events. Never contains document content, filenames, or free-form messages.';

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
  if cleaned_event not in (
    'page_view',
    'tool_opened',
    'processing_started',
    'processing_succeeded',
    'processing_failed',
    'processing_cancelled',
    'download_started'
  ) then
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

  if cleaned_error is not null and cleaned_error not in (
    'unsupported_file',
    'file_too_large',
    'invalid_pdf',
    'processing_error',
    'browser_limit',
    'cancelled',
    'input_validation',
    'docx_parse_error',
    'unsupported_document_feature',
    'wasm_load_error',
    'wasm_compile_error',
    'worker_error',
    'font_load_error',
    'render_error',
    'pdf_generation_error',
    'pdf_validation_error',
    'memory_limit',
    'timeout',
    'user_cancelled',
    'unknown'
  ) then
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

create or replace function public.record_public_analytics_event(
  event_name text,
  tool_slug text,
  anonymous_session_id uuid,
  duration_ms integer,
  input_size_bucket text,
  output_size_bucket text,
  device_class text,
  browser_family text,
  operating_system text,
  success boolean,
  error_code text,
  country_code text,
  region text,
  city text,
  failure_stage text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id bigint;
  cleaned_stage text := lower(nullif(trim(record_public_analytics_event.failure_stage), ''));
begin
  if cleaned_stage is not null and cleaned_stage not in (
    'preparing',
    'loading-engine',
    'converting',
    'generating',
    'validating',
    'finalizing',
    'unknown'
  ) then
    cleaned_stage := 'unknown';
  end if;

  inserted_id := public.record_public_analytics_event(
    record_public_analytics_event.event_name,
    record_public_analytics_event.tool_slug,
    record_public_analytics_event.anonymous_session_id,
    record_public_analytics_event.duration_ms,
    record_public_analytics_event.input_size_bucket,
    record_public_analytics_event.output_size_bucket,
    record_public_analytics_event.device_class,
    record_public_analytics_event.browser_family,
    record_public_analytics_event.operating_system,
    record_public_analytics_event.success,
    record_public_analytics_event.error_code,
    record_public_analytics_event.country_code,
    record_public_analytics_event.region,
    record_public_analytics_event.city
  );

  if inserted_id > 0
    and lower(trim(record_public_analytics_event.event_name)) in ('processing_failed', 'processing_cancelled')
  then
    update public.analytics_events
    set failure_stage = coalesce(cleaned_stage, 'unknown')
    where id = inserted_id;
  end if;

  return inserted_id;
end;
$$;

revoke all on function public.record_public_analytics_event(text, text, uuid, integer, text, text, text, text, text, boolean, text, text, text, text, text) from public;
grant execute on function public.record_public_analytics_event(text, text, uuid, integer, text, text, text, text, text, boolean, text, text, text, text, text) to anon;
grant execute on function public.record_public_analytics_event(text, text, uuid, integer, text, text, text, text, text, boolean, text, text, text, text, text) to authenticated;

create or replace function public.get_admin_conversion_diagnostics(
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
  cancelled_count bigint;
  daily_cancelled jsonb;
  failure_stage_summary jsonb;
  cancellation_stage_summary jsonb;
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

  range_start := p_start_date::timestamp at time zone 'Asia/Kolkata';
  range_end := (p_end_date + 1)::timestamp at time zone 'Asia/Kolkata';

  select count(*)::bigint
  into cancelled_count
  from public.analytics_events
  where occurred_at >= range_start
    and occurred_at < range_end
    and event_name = 'processing_cancelled';

  with days as (
    select generate_series(p_start_date, p_end_date, interval '1 day')::date as metric_date
  ),
  grouped as (
    select
      (occurred_at at time zone 'Asia/Kolkata')::date as metric_date,
      count(*)::bigint as event_count
    from public.analytics_events
    where occurred_at >= range_start
      and occurred_at < range_end
      and event_name = 'processing_cancelled'
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date',
        days.metric_date,
        'event_count',
        coalesce(grouped.event_count, 0)
      )
      order by days.metric_date
    ),
    '[]'::jsonb
  )
  into daily_cancelled
  from days
  left join grouped using (metric_date);

  with grouped as (
    select coalesce(failure_stage, 'unknown') as failure_stage, count(*)::bigint as event_count
    from public.analytics_events
    where occurred_at >= range_start
      and occurred_at < range_end
      and event_name = 'processing_failed'
    group by coalesce(failure_stage, 'unknown')
    order by event_count desc, failure_stage asc
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('failure_stage', failure_stage, 'event_count', event_count)),
    '[]'::jsonb
  )
  into failure_stage_summary
  from grouped;

  with grouped as (
    select coalesce(failure_stage, 'unknown') as failure_stage, count(*)::bigint as event_count
    from public.analytics_events
    where occurred_at >= range_start
      and occurred_at < range_end
      and event_name = 'processing_cancelled'
    group by coalesce(failure_stage, 'unknown')
    order by event_count desc, failure_stage asc
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('failure_stage', failure_stage, 'event_count', event_count)),
    '[]'::jsonb
  )
  into cancellation_stage_summary
  from grouped;

  return jsonb_build_object(
    'processing_cancelled',
    cancelled_count,
    'daily_cancelled',
    daily_cancelled,
    'failure_stage_summary',
    failure_stage_summary,
    'cancellation_stage_summary',
    cancellation_stage_summary
  );
end;
$$;

revoke all on function public.get_admin_conversion_diagnostics(date, date) from public;
grant execute on function public.get_admin_conversion_diagnostics(date, date) to authenticated;

commit;
