begin;

do $$
begin
  if to_regclass('public.analytics_events') is null then
    raise exception 'Missing required table public.analytics_events.';
  end if;
  if to_regclass('public.pdf_tools') is null then
    raise exception 'Missing required table public.pdf_tools.';
  end if;
  if to_regclass('public.site_settings') is null then
    raise exception 'Missing required table public.site_settings.';
  end if;
  if to_regclass('public.admin_members') is null then
    raise exception 'Missing required table public.admin_members.';
  end if;
end;
$$;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

alter table public.analytics_events
  add column if not exists visitor_key text,
  add column if not exists session_key text,
  add column if not exists traffic_class text,
  add column if not exists traffic_class_reason text,
  add column if not exists geo_source text,
  add column if not exists geo_precision text,
  add column if not exists region_code text,
  add column if not exists page_path text,
  add column if not exists referrer_host text,
  add column if not exists landing_path text,
  add column if not exists acquisition_source text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists analytics_schema_version smallint not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.analytics_events'::regclass
      and conname = 'analytics_events_traffic_class_check'
  ) then
    alter table public.analytics_events
      add constraint analytics_events_traffic_class_check
      check (
        traffic_class is null or traffic_class in (
          'real_audience',
          'synthetic',
          'known_bot',
          'suspected_automation'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.analytics_events'::regclass
      and conname = 'analytics_events_geo_source_check'
  ) then
    alter table public.analytics_events
      add constraint analytics_events_geo_source_check
      check (geo_source is null or geo_source in ('cloudflare', 'unresolved'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.analytics_events'::regclass
      and conname = 'analytics_events_geo_precision_check'
  ) then
    alter table public.analytics_events
      add constraint analytics_events_geo_precision_check
      check (
        geo_precision is null or geo_precision in ('city', 'region', 'country', 'unresolved')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.analytics_events'::regclass
      and conname = 'analytics_events_acquisition_source_check'
  ) then
    alter table public.analytics_events
      add constraint analytics_events_acquisition_source_check
      check (
        acquisition_source is null or acquisition_source in (
          'direct',
          'google',
          'bing',
          'other_search',
          'referral',
          'campaign'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.analytics_events'::regclass
      and conname = 'analytics_events_schema_version_check'
  ) then
    alter table public.analytics_events
      add constraint analytics_events_schema_version_check
      check (analytics_schema_version in (1, 2));
  end if;
end;
$$;

create index if not exists analytics_events_traffic_time_idx
  on public.analytics_events (traffic_class, occurred_at desc)
  where analytics_schema_version = 2;

create index if not exists analytics_events_visitor_time_idx
  on public.analytics_events (visitor_key, occurred_at)
  where analytics_schema_version = 2 and visitor_key is not null;

create index if not exists analytics_events_session_time_idx
  on public.analytics_events (session_key, occurred_at)
  where analytics_schema_version = 2 and session_key is not null;

create index if not exists analytics_events_event_traffic_time_idx
  on public.analytics_events (event_name, traffic_class, occurred_at desc)
  where analytics_schema_version = 2;

create index if not exists analytics_events_tool_traffic_time_idx
  on public.analytics_events (tool_slug, traffic_class, occurred_at desc)
  where analytics_schema_version = 2 and tool_slug is not null;

create table if not exists private.analytics_ingest_config (
  singleton boolean primary key default true check (singleton),
  secret_hash bytea not null,
  updated_at timestamptz not null default now()
);

revoke all on table private.analytics_ingest_config from public;
revoke all on table private.analytics_ingest_config from anon;
revoke all on table private.analytics_ingest_config from authenticated;

create table if not exists private.analytics_ingest_rate_limits (
  request_key text not null,
  minute_bucket timestamptz not null,
  event_count integer not null default 0,
  primary key (request_key, minute_bucket)
);

revoke all on table private.analytics_ingest_rate_limits from public;
revoke all on table private.analytics_ingest_rate_limits from anon;
revoke all on table private.analytics_ingest_rate_limits from authenticated;

create or replace function public.rotate_analytics_ingest_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- EXECUTE is granted only to service_role below. Avoid checking
  -- current_user/session_user here because SECURITY DEFINER changes
  -- current_user to the function owner under PostgREST.
  if p_secret is null or length(p_secret) < 32 or length(p_secret) > 256 then
    raise exception 'Analytics ingest secret must be between 32 and 256 characters.';
  end if;

  insert into private.analytics_ingest_config(singleton, secret_hash, updated_at)
  values (true, extensions.digest(p_secret, 'sha256'), now())
  on conflict (singleton) do update
    set secret_hash = excluded.secret_hash,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.rotate_analytics_ingest_secret(text) from public;
revoke all on function public.rotate_analytics_ingest_secret(text) from anon;
revoke all on function public.rotate_analytics_ingest_secret(text) from authenticated;
grant execute on function public.rotate_analytics_ingest_secret(text) to service_role;

create or replace function public.record_server_analytics_event(
  p_event_name text,
  p_tool_slug text default null,
  p_visitor_key text default null,
  p_session_key text default null,
  p_request_key text default null,
  p_traffic_class text default 'real_audience',
  p_traffic_class_reason text default null,
  p_duration_ms integer default null,
  p_input_size_bucket text default null,
  p_output_size_bucket text default null,
  p_device_class text default 'unknown',
  p_browser_family text default 'Unknown',
  p_operating_system text default 'Unknown',
  p_success boolean default null,
  p_error_code text default null,
  p_country_code text default null,
  p_region text default null,
  p_region_code text default null,
  p_city text default null,
  p_geo_source text default 'unresolved',
  p_geo_precision text default 'unresolved',
  p_page_path text default null,
  p_referrer_host text default null,
  p_landing_path text default null,
  p_acquisition_source text default 'direct',
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_headers jsonb;
  supplied_secret text;
  expected_hash bytea;
  cleaned_event text := lower(trim(p_event_name));
  cleaned_tool text := nullif(lower(trim(p_tool_slug)), '');
  cleaned_traffic text := lower(trim(coalesce(p_traffic_class, 'real_audience')));
  cleaned_reason text := nullif(left(trim(p_traffic_class_reason), 80), '');
  cleaned_input_bucket text := coalesce(nullif(lower(trim(p_input_size_bucket)), ''), 'unknown');
  cleaned_output_bucket text := coalesce(nullif(lower(trim(p_output_size_bucket)), ''), 'unknown');
  cleaned_device text := coalesce(nullif(lower(trim(p_device_class)), ''), 'unknown');
  cleaned_browser text := coalesce(left(nullif(trim(p_browser_family), ''), 24), 'Unknown');
  cleaned_os text := coalesce(left(nullif(trim(p_operating_system), ''), 24), 'Unknown');
  cleaned_error text := nullif(lower(trim(p_error_code)), '');
  cleaned_country text := nullif(upper(left(trim(p_country_code), 2)), '');
  cleaned_region text := nullif(left(trim(p_region), 120), '');
  cleaned_region_code text := nullif(upper(left(trim(p_region_code), 12)), '');
  cleaned_city text := nullif(left(trim(p_city), 120), '');
  cleaned_geo_source text := lower(trim(coalesce(p_geo_source, 'unresolved')));
  cleaned_geo_precision text := lower(trim(coalesce(p_geo_precision, 'unresolved')));
  cleaned_page_path text := nullif(left(trim(p_page_path), 220), '');
  cleaned_referrer_host text := nullif(lower(left(trim(p_referrer_host), 160)), '');
  cleaned_landing_path text := nullif(left(trim(p_landing_path), 220), '');
  cleaned_acquisition text := lower(trim(coalesce(p_acquisition_source, 'direct')));
  cleaned_utm_source text := nullif(left(trim(p_utm_source), 100), '');
  cleaned_utm_medium text := nullif(left(trim(p_utm_medium), 100), '');
  cleaned_utm_campaign text := nullif(left(trim(p_utm_campaign), 120), '');
  bounded_duration integer := null;
  request_bucket timestamptz := date_trunc('minute', now());
  request_count integer := 0;
  session_recent_count integer := 0;
begin
  request_headers := coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );
  supplied_secret := request_headers ->> 'x-lumeo-analytics-ingest';

  select config.secret_hash
  into expected_hash
  from private.analytics_ingest_config as config
  where config.singleton = true;

  if expected_hash is null
     or supplied_secret is null
     or extensions.digest(supplied_secret, 'sha256') <> expected_hash then
    raise exception 'Analytics ingestion authorization failed.';
  end if;

  if not exists (
    select 1
    from public.site_settings as settings
    where settings.key = 'public_analytics_enabled'
      and settings.is_public = true
      and settings.value @> '{"enabled": true}'::jsonb
  ) then
    return false;
  end if;

  if cleaned_event not in (
    'page_view',
    'tool_opened',
    'processing_started',
    'processing_succeeded',
    'processing_failed',
    'download_started'
  ) then
    raise exception 'Unsupported analytics event.';
  end if;

  if p_visitor_key is null or p_visitor_key !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Invalid visitor identity.';
  end if;

  if p_session_key is null or p_session_key !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Invalid session identity.';
  end if;

  if p_request_key is null or p_request_key !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Invalid request identity.';
  end if;

  if cleaned_traffic not in (
    'real_audience',
    'synthetic',
    'known_bot',
    'suspected_automation'
  ) then
    raise exception 'Invalid traffic class.';
  end if;

  if cleaned_tool is not null then
    if cleaned_tool !~ '^[a-z0-9-]{1,80}$' or not exists (
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

  if cleaned_input_bucket not in (
    'under_1mb',
    '1mb_to_5mb',
    '5mb_to_20mb',
    '20mb_to_50mb',
    'over_50mb',
    'unknown'
  ) then
    cleaned_input_bucket := 'unknown';
  end if;

  if cleaned_output_bucket not in (
    'under_1mb',
    '1mb_to_5mb',
    '5mb_to_20mb',
    '20mb_to_50mb',
    'over_50mb',
    'unknown'
  ) then
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
    'unknown'
  ) then
    cleaned_error := 'unknown';
  end if;

  if p_duration_ms is not null then
    bounded_duration := greatest(0, least(p_duration_ms, 86400000));
  end if;

  if cleaned_geo_source not in ('cloudflare', 'unresolved') then
    cleaned_geo_source := 'unresolved';
  end if;

  if cleaned_geo_precision not in ('city', 'region', 'country', 'unresolved') then
    cleaned_geo_precision := 'unresolved';
  end if;

  if cleaned_country is null then
    cleaned_city := null;
    cleaned_region := null;
    cleaned_region_code := null;
    cleaned_geo_source := 'unresolved';
    cleaned_geo_precision := 'unresolved';
  elsif cleaned_city is not null then
    cleaned_geo_source := 'cloudflare';
    cleaned_geo_precision := 'city';
  elsif cleaned_region is not null or cleaned_region_code is not null then
    cleaned_geo_source := 'cloudflare';
    cleaned_geo_precision := 'region';
  else
    cleaned_geo_source := 'cloudflare';
    cleaned_geo_precision := 'country';
  end if;

  if cleaned_page_path is not null and (
    cleaned_page_path !~ '^/[A-Za-z0-9/_-]*$'
    or position('?' in cleaned_page_path) > 0
    or position('#' in cleaned_page_path) > 0
  ) then
    cleaned_page_path := null;
  end if;

  if cleaned_landing_path is not null and (
    cleaned_landing_path !~ '^/[A-Za-z0-9/_-]*$'
    or position('?' in cleaned_landing_path) > 0
    or position('#' in cleaned_landing_path) > 0
  ) then
    cleaned_landing_path := null;
  end if;

  if cleaned_referrer_host is not null
     and cleaned_referrer_host !~ '^[a-z0-9.-]+$' then
    cleaned_referrer_host := null;
  end if;

  if cleaned_acquisition not in (
    'direct',
    'google',
    'bing',
    'other_search',
    'referral',
    'campaign'
  ) then
    cleaned_acquisition := 'direct';
  end if;

  delete from private.analytics_ingest_rate_limits
  where minute_bucket < now() - interval '15 minutes';

  insert into private.analytics_ingest_rate_limits(request_key, minute_bucket, event_count)
  values (p_request_key, request_bucket, 1)
  on conflict (request_key, minute_bucket) do update
    set event_count = private.analytics_ingest_rate_limits.event_count + 1
  returning event_count into request_count;

  if request_count > 180 then
    raise exception 'Analytics rate limit reached.';
  end if;

  select count(*)
  into session_recent_count
  from public.analytics_events as events
  where events.analytics_schema_version = 2
    and events.session_key = p_session_key
    and events.occurred_at > now() - interval '1 minute';

  if session_recent_count >= 80 then
    raise exception 'Analytics rate limit reached.';
  end if;

  if exists (
    select 1
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.session_key = p_session_key
      and events.event_name = cleaned_event
      and coalesce(events.tool_slug, '') = coalesce(cleaned_tool, '')
      and events.occurred_at > now() - interval '3 seconds'
  ) then
    return true;
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
    error_code,
    metadata,
    region,
    city,
    visitor_key,
    session_key,
    traffic_class,
    traffic_class_reason,
    geo_source,
    geo_precision,
    region_code,
    page_path,
    referrer_host,
    landing_path,
    acquisition_source,
    utm_source,
    utm_medium,
    utm_campaign,
    analytics_schema_version
  )
  values (
    cleaned_event,
    cleaned_tool,
    null,
    now(),
    bounded_duration,
    cleaned_input_bucket,
    cleaned_output_bucket,
    cleaned_device,
    cleaned_browser,
    cleaned_os,
    cleaned_country,
    p_success,
    cleaned_error,
    '{}'::jsonb,
    cleaned_region,
    cleaned_city,
    p_visitor_key,
    p_session_key,
    cleaned_traffic,
    cleaned_reason,
    cleaned_geo_source,
    cleaned_geo_precision,
    cleaned_region_code,
    cleaned_page_path,
    cleaned_referrer_host,
    cleaned_landing_path,
    cleaned_acquisition,
    cleaned_utm_source,
    cleaned_utm_medium,
    cleaned_utm_campaign,
    2
  );

  return true;
end;
$$;

comment on function public.record_server_analytics_event(
  text, text, text, text, text, text, text, integer, text, text, text, text, text,
  boolean, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text
) is
  'Server-only analytics writer. It accepts only validated product-event fields from the Lumeo Cloudflare application, trusts no client geography/classification/timestamp, and requires a Cloudflare-only ingest secret supplied as a request header. Raw visitor/session cookie tokens and raw IP addresses are never stored.';

revoke all on function public.record_server_analytics_event(
  text, text, text, text, text, text, text, integer, text, text, text, text, text,
  boolean, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text
) from public;
revoke all on function public.record_server_analytics_event(
  text, text, text, text, text, text, text, integer, text, text, text, text, text,
  boolean, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text
) from anon;
revoke all on function public.record_server_analytics_event(
  text, text, text, text, text, text, text, integer, text, text, text, text, text,
  boolean, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text
) from authenticated;
grant execute on function public.record_server_analytics_event(
  text, text, text, text, text, text, text, integer, text, text, text, text, text,
  boolean, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text
) to anon;
grant execute on function public.record_server_analytics_event(
  text, text, text, text, text, text, text, integer, text, text, text, text, text,
  boolean, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text
) to authenticated;

create or replace function public.get_admin_analytics_dashboard(
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
  admin_role text;
  range_start timestamptz;
  range_end timestamptz;
  previous_start timestamptz;
  previous_end timestamptz;
  scope_name text := lower(trim(coalesce(p_traffic_scope, 'real_audience')));
  summary jsonb;
  previous_summary jsonb;
  daily_audience jsonb;
  hourly_audience jsonb;
  geography jsonb;
  acquisition jsonb;
  tool_performance jsonb;
  funnel jsonb;
  technical jsonb;
  integrity jsonb;
  traffic_counts jsonb;
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

  if scope_name not in ('real_audience', 'synthetic', 'automation', 'all') then
    raise exception 'Unsupported analytics traffic scope.';
  end if;

  range_start := p_start_date::timestamp at time zone 'Asia/Kolkata';
  range_end := (p_end_date + 1)::timestamp at time zone 'Asia/Kolkata';
  previous_end := range_start;
  previous_start := range_start - (range_end - range_start);

  with scoped as (
    select *
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.occurred_at >= range_start
      and events.occurred_at < range_end
      and (
        scope_name = 'all'
        or events.traffic_class = scope_name
        or (
          scope_name = 'automation'
          and events.traffic_class in ('known_bot', 'suspected_automation')
        )
      )
  ),
  first_real as (
    select events.visitor_key, min(events.occurred_at) as first_at
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.traffic_class = 'real_audience'
      and events.visitor_key is not null
    group by events.visitor_key
  ),
  day_sessions as (
    select
      scoped.visitor_key,
      (scoped.occurred_at at time zone 'Asia/Kolkata')::date as event_date,
      count(distinct scoped.session_key)::bigint as sessions
    from scoped
    where scoped.visitor_key is not null and scoped.session_key is not null
    group by scoped.visitor_key, (scoped.occurred_at at time zone 'Asia/Kolkata')::date
  ),
  frequent as (
    select events.visitor_key
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.traffic_class = 'real_audience'
      and events.visitor_key is not null
      and events.occurred_at >= range_end - interval '30 days'
      and events.occurred_at < range_end
    group by events.visitor_key
    having count(distinct (events.occurred_at at time zone 'Asia/Kolkata')::date) >= 3
  )
  select jsonb_build_object(
    'unique_visitors',
      coalesce((select count(distinct scoped.visitor_key)::bigint from scoped where scoped.visitor_key is not null), 0),
    'new_visitors',
      case when scope_name = 'real_audience' then coalesce((
        select count(distinct scoped.visitor_key)::bigint
        from scoped
        join first_real using (visitor_key)
        where first_real.first_at >= range_start and first_real.first_at < range_end
      ), 0) else null end,
    'returning_visitors',
      case when scope_name = 'real_audience' then coalesce((
        select count(distinct scoped.visitor_key)::bigint
        from scoped
        join first_real using (visitor_key)
        where first_real.first_at < range_start
      ), 0) else null end,
    'repeated_daily_visitors',
      case when scope_name = 'real_audience' then coalesce((
        select count(distinct day_sessions.visitor_key)::bigint
        from day_sessions
        where day_sessions.sessions >= 2
      ), 0) else null end,
    'frequent_visitors',
      case when scope_name = 'real_audience' then coalesce((
        select count(*)::bigint
        from frequent
        where exists (
          select 1 from scoped where scoped.visitor_key = frequent.visitor_key
        )
      ), 0) else null end,
    'page_views',
      coalesce((select count(*)::bigint from scoped where event_name = 'page_view'), 0),
    'tool_users',
      coalesce((select count(distinct visitor_key)::bigint from scoped where event_name = 'tool_opened' and visitor_key is not null), 0),
    'tool_opens',
      coalesce((select count(*)::bigint from scoped where event_name = 'tool_opened'), 0),
    'processing_started',
      coalesce((select count(*)::bigint from scoped where event_name = 'processing_started'), 0),
    'processing_succeeded',
      coalesce((select count(*)::bigint from scoped where event_name = 'processing_succeeded'), 0),
    'processing_failed',
      coalesce((select count(*)::bigint from scoped where event_name = 'processing_failed'), 0),
    'downloads_started',
      coalesce((select count(*)::bigint from scoped where event_name = 'download_started'), 0),
    'average_successful_duration_ms', (
      select case
        when count(*) filter (where duration_ms is not null) > 0
          then round(avg(duration_ms) filter (where duration_ms is not null))::bigint
        else null
      end
      from scoped
      where event_name = 'processing_succeeded'
    ),
    'latest_event_at', (select max(occurred_at) from scoped),
    'active_visitors',
      case when scope_name = 'real_audience' then coalesce((
        select count(distinct events.visitor_key)::bigint
        from public.analytics_events as events
        where events.analytics_schema_version = 2
          and events.traffic_class = 'real_audience'
          and events.visitor_key is not null
          and events.occurred_at >= now() - interval '5 minutes'
      ), 0) else null end
  )
  into summary;

  with scoped as (
    select *
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.occurred_at >= previous_start
      and events.occurred_at < previous_end
      and (
        scope_name = 'all'
        or events.traffic_class = scope_name
        or (
          scope_name = 'automation'
          and events.traffic_class in ('known_bot', 'suspected_automation')
        )
      )
  ),
  first_real as (
    select events.visitor_key, min(events.occurred_at) as first_at
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.traffic_class = 'real_audience'
      and events.visitor_key is not null
    group by events.visitor_key
  )
  select jsonb_build_object(
    'unique_visitors', coalesce(count(distinct scoped.visitor_key), 0)::bigint,
    'new_visitors', case when scope_name = 'real_audience'
      then coalesce(count(distinct scoped.visitor_key) filter (
        where first_real.first_at >= previous_start and first_real.first_at < previous_end
      ), 0)::bigint else null end,
    'returning_visitors', case when scope_name = 'real_audience'
      then coalesce(count(distinct scoped.visitor_key) filter (
        where first_real.first_at < previous_start
      ), 0)::bigint else null end,
    'page_views', coalesce(count(*) filter (where scoped.event_name = 'page_view'), 0)::bigint,
    'tool_opens', coalesce(count(*) filter (where scoped.event_name = 'tool_opened'), 0)::bigint,
    'processing_succeeded', coalesce(count(*) filter (where scoped.event_name = 'processing_succeeded'), 0)::bigint,
    'downloads_started', coalesce(count(*) filter (where scoped.event_name = 'download_started'), 0)::bigint
  )
  into previous_summary
  from scoped
  left join first_real using (visitor_key);

  with days as (
    select generate_series(p_start_date, p_end_date, interval '1 day')::date as metric_date
  ),
  scoped as (
    select
      events.*,
      (events.occurred_at at time zone 'Asia/Kolkata')::date as event_date
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.occurred_at >= range_start
      and events.occurred_at < range_end
      and (
        scope_name = 'all'
        or events.traffic_class = scope_name
        or (
          scope_name = 'automation'
          and events.traffic_class in ('known_bot', 'suspected_automation')
        )
      )
  ),
  first_real as (
    select events.visitor_key, min(events.occurred_at) as first_at
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.traffic_class = 'real_audience'
      and events.visitor_key is not null
    group by events.visitor_key
  ),
  visitor_days as (
    select
      scoped.event_date,
      scoped.visitor_key,
      count(distinct scoped.session_key)::bigint as sessions
    from scoped
    where scoped.visitor_key is not null
    group by scoped.event_date, scoped.visitor_key
  ),
  daily_events as (
    select
      scoped.event_date,
      count(distinct scoped.visitor_key)::bigint as unique_visitors,
      count(*) filter (where scoped.event_name = 'page_view')::bigint as page_views,
      count(distinct scoped.visitor_key) filter (
        where scoped.event_name = 'tool_opened' and scoped.visitor_key is not null
      )::bigint as tool_users,
      count(*) filter (where scoped.event_name = 'processing_succeeded')::bigint as processing_succeeded,
      count(*) filter (where scoped.event_name = 'download_started')::bigint as downloads_started
    from scoped
    group by scoped.event_date
  ),
  daily_visitors as (
    select
      visitor_days.event_date,
      count(*) filter (
        where scope_name = 'real_audience'
          and first_real.first_at >= visitor_days.event_date::timestamp at time zone 'Asia/Kolkata'
          and first_real.first_at < (visitor_days.event_date + 1)::timestamp at time zone 'Asia/Kolkata'
      )::bigint as new_visitors,
      count(*) filter (
        where scope_name = 'real_audience'
          and first_real.first_at < visitor_days.event_date::timestamp at time zone 'Asia/Kolkata'
      )::bigint as returning_visitors,
      count(*) filter (
        where scope_name = 'real_audience' and visitor_days.sessions >= 2
      )::bigint as repeated_daily_visitors
    from visitor_days
    left join first_real using (visitor_key)
    group by visitor_days.event_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', days.metric_date,
    'unique_visitors', coalesce(daily_events.unique_visitors, 0),
    'new_visitors', case when scope_name = 'real_audience' then coalesce(daily_visitors.new_visitors, 0) else null end,
    'returning_visitors', case when scope_name = 'real_audience' then coalesce(daily_visitors.returning_visitors, 0) else null end,
    'repeated_daily_visitors', case when scope_name = 'real_audience' then coalesce(daily_visitors.repeated_daily_visitors, 0) else null end,
    'page_views', coalesce(daily_events.page_views, 0),
    'tool_users', coalesce(daily_events.tool_users, 0),
    'processing_succeeded', coalesce(daily_events.processing_succeeded, 0),
    'downloads_started', coalesce(daily_events.downloads_started, 0)
  ) order by days.metric_date), '[]'::jsonb)
  into daily_audience
  from days
  left join daily_events on daily_events.event_date = days.metric_date
  left join daily_visitors on daily_visitors.event_date = days.metric_date;

  if p_start_date = p_end_date then
    with hours as (
      select generate_series(
        0,
        case
          when p_start_date = (now() at time zone 'Asia/Kolkata')::date
            then extract(hour from now() at time zone 'Asia/Kolkata')::integer
          else 23
        end
      )::integer as hour_of_day
    ),
    scoped as (
      select
        events.*,
        extract(hour from events.occurred_at at time zone 'Asia/Kolkata')::integer as hour_of_day
      from public.analytics_events as events
      where events.analytics_schema_version = 2
        and events.occurred_at >= range_start
        and events.occurred_at < range_end
        and (
          scope_name = 'all'
          or events.traffic_class = scope_name
          or (
            scope_name = 'automation'
            and events.traffic_class in ('known_bot', 'suspected_automation')
          )
        )
    ),
    grouped as (
      select
        scoped.hour_of_day,
        count(distinct scoped.visitor_key)::bigint as unique_visitors,
        count(*) filter (where scoped.event_name = 'page_view')::bigint as page_views,
        count(*) filter (where scoped.event_name = 'tool_opened')::bigint as tool_opens,
        count(*) filter (where scoped.event_name = 'processing_succeeded')::bigint as processing_succeeded,
        count(*) filter (where scoped.event_name = 'download_started')::bigint as downloads_started
      from scoped
      group by scoped.hour_of_day
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'hour', hours.hour_of_day,
      'unique_visitors', coalesce(grouped.unique_visitors, 0),
      'page_views', coalesce(grouped.page_views, 0),
      'tool_opens', coalesce(grouped.tool_opens, 0),
      'processing_succeeded', coalesce(grouped.processing_succeeded, 0),
      'downloads_started', coalesce(grouped.downloads_started, 0)
    ) order by hours.hour_of_day), '[]'::jsonb)
    into hourly_audience
    from hours
    left join grouped using (hour_of_day);
  else
    hourly_audience := '[]'::jsonb;
  end if;

  with scoped as (
    select *
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.occurred_at >= range_start
      and events.occurred_at < range_end
      and (
        scope_name = 'all'
        or events.traffic_class = scope_name
        or (
          scope_name = 'automation'
          and events.traffic_class in ('known_bot', 'suspected_automation')
        )
      )
  ),
  countries as (
    select
      country_code,
      count(distinct visitor_key)::bigint as visitors
    from scoped
    where geo_source = 'cloudflare'
      and country_code is not null
      and visitor_key is not null
    group by country_code
    order by visitors desc, country_code
    limit 100
  ),
  regions as (
    select
      country_code,
      region,
      region_code,
      count(distinct visitor_key)::bigint as visitors
    from scoped
    where geo_source = 'cloudflare'
      and country_code is not null
      and (region is not null or region_code is not null)
      and visitor_key is not null
    group by country_code, region, region_code
    order by visitors desc, country_code, region, region_code
    limit 200
  ),
  cities as (
    select
      country_code,
      region,
      region_code,
      city,
      count(distinct visitor_key)::bigint as visitors
    from scoped
    where geo_source = 'cloudflare'
      and country_code is not null
      and city is not null
      and visitor_key is not null
    group by country_code, region, region_code, city
    order by visitors desc, country_code, region, city
    limit 300
  )
  select jsonb_build_object(
    'countries', coalesce((select jsonb_agg(to_jsonb(countries)) from countries), '[]'::jsonb),
    'regions', coalesce((select jsonb_agg(to_jsonb(regions)) from regions), '[]'::jsonb),
    'cities', coalesce((select jsonb_agg(to_jsonb(cities)) from cities), '[]'::jsonb)
  )
  into geography;

  with scoped as (
    select *
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.occurred_at >= range_start
      and events.occurred_at < range_end
      and (
        scope_name = 'all'
        or events.traffic_class = scope_name
        or (
          scope_name = 'automation'
          and events.traffic_class in ('known_bot', 'suspected_automation')
        )
      )
  ),
  session_entries as (
    select distinct on (session_key)
      session_key,
      visitor_key,
      acquisition_source,
      referrer_host,
      landing_path,
      utm_source,
      utm_medium,
      utm_campaign,
      occurred_at
    from scoped
    where session_key is not null
    order by session_key, occurred_at asc
  ),
  sources as (
    select
      coalesce(acquisition_source, 'direct') as source,
      count(distinct session_key)::bigint as sessions,
      count(distinct visitor_key)::bigint as visitors
    from session_entries
    group by coalesce(acquisition_source, 'direct')
    order by visitors desc, source
  ),
  referrers as (
    select
      referrer_host,
      count(distinct session_key)::bigint as sessions,
      count(distinct visitor_key)::bigint as visitors
    from session_entries
    where referrer_host is not null
    group by referrer_host
    order by visitors desc, referrer_host
    limit 50
  ),
  landings as (
    select
      landing_path,
      count(distinct session_key)::bigint as sessions,
      count(distinct visitor_key)::bigint as visitors
    from session_entries
    where landing_path is not null
    group by landing_path
    order by visitors desc, landing_path
    limit 50
  ),
  first_tools as (
    select distinct on (session_key)
      session_key,
      visitor_key,
      tool_slug
    from scoped
    where session_key is not null
      and event_name = 'tool_opened'
      and tool_slug is not null
    order by session_key, occurred_at asc
  ),
  entry_tools as (
    select
      tool_slug,
      count(distinct session_key)::bigint as sessions,
      count(distinct visitor_key)::bigint as visitors
    from first_tools
    group by tool_slug
    order by visitors desc, tool_slug
    limit 50
  )
  select jsonb_build_object(
    'sources', coalesce((select jsonb_agg(to_jsonb(sources)) from sources), '[]'::jsonb),
    'referrers', coalesce((select jsonb_agg(to_jsonb(referrers)) from referrers), '[]'::jsonb),
    'landing_pages', coalesce((select jsonb_agg(to_jsonb(landings)) from landings), '[]'::jsonb),
    'entry_tools', coalesce((select jsonb_agg(to_jsonb(entry_tools)) from entry_tools), '[]'::jsonb)
  )
  into acquisition;

  with scoped as (
    select *
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.occurred_at >= range_start
      and events.occurred_at < range_end
      and events.tool_slug is not null
      and (
        scope_name = 'all'
        or events.traffic_class = scope_name
        or (
          scope_name = 'automation'
          and events.traffic_class in ('known_bot', 'suspected_automation')
        )
      )
  ),
  tool_rows as (
    select
      scoped.tool_slug,
      count(distinct scoped.visitor_key) filter (where scoped.event_name = 'tool_opened')::bigint as unique_users,
      count(*) filter (where scoped.event_name = 'tool_opened')::bigint as opens,
      count(*) filter (where scoped.event_name = 'processing_started')::bigint as processing_started,
      count(*) filter (where scoped.event_name = 'processing_succeeded')::bigint as succeeded,
      count(*) filter (where scoped.event_name = 'processing_failed')::bigint as failed,
      count(*) filter (where scoped.event_name = 'download_started')::bigint as downloads,
      case
        when count(*) filter (where scoped.event_name = 'processing_started') > 0
          then round(
            (
              count(*) filter (where scoped.event_name = 'processing_succeeded')
            )::numeric * 100.0
            /
            (
              count(*) filter (where scoped.event_name = 'processing_started')
            )::numeric,
            1
          )
        else null
      end as completion_rate,
      case
        when count(*) filter (
          where scoped.event_name = 'processing_succeeded' and scoped.duration_ms is not null
        ) > 0 then round(avg(scoped.duration_ms) filter (
          where scoped.event_name = 'processing_succeeded' and scoped.duration_ms is not null
        ))::bigint
        else null
      end as average_successful_duration_ms
    from scoped
    group by scoped.tool_slug
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'tool_slug', tool_rows.tool_slug,
      'unique_users', tool_rows.unique_users,
      'opens', tool_rows.opens,
      'processing_started', tool_rows.processing_started,
      'succeeded', tool_rows.succeeded,
      'failed', tool_rows.failed,
      'downloads', tool_rows.downloads,
      'completion_rate', tool_rows.completion_rate,
      'average_successful_duration_ms', tool_rows.average_successful_duration_ms,
      'lifecycle_applicable', exists (
        select 1
        from public.analytics_events as historical
        where historical.analytics_schema_version = 2
          and historical.tool_slug = tool_rows.tool_slug
          and historical.event_name in (
            'processing_started',
            'processing_succeeded',
            'processing_failed',
            'download_started'
          )
      )
    )
    order by tool_rows.opens desc, tool_rows.tool_slug
  ), '[]'::jsonb)
  into tool_performance
  from tool_rows;

  with scoped as (
    select *
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.occurred_at >= range_start
      and events.occurred_at < range_end
      and (
        scope_name = 'all'
        or events.traffic_class = scope_name
        or (
          scope_name = 'automation'
          and events.traffic_class in ('known_bot', 'suspected_automation')
        )
      )
  )
  select jsonb_build_object(
    'visits', count(distinct session_key) filter (where event_name = 'page_view')::bigint,
    'tool_open', count(distinct session_key) filter (where event_name = 'tool_opened')::bigint,
    'processing_started', count(distinct session_key) filter (where event_name = 'processing_started')::bigint,
    'processing_succeeded', count(distinct session_key) filter (where event_name = 'processing_succeeded')::bigint,
    'downloads', count(distinct session_key) filter (where event_name = 'download_started')::bigint
  )
  into funnel
  from scoped;

  with scoped as (
    select *
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.occurred_at >= range_start
      and events.occurred_at < range_end
      and (
        scope_name = 'all'
        or events.traffic_class = scope_name
        or (
          scope_name = 'automation'
          and events.traffic_class in ('known_bot', 'suspected_automation')
        )
      )
  ),
  devices as (
    select device_class as label, count(distinct visitor_key)::bigint as visitors
    from scoped
    where visitor_key is not null
    group by device_class
    order by visitors desc, label
  ),
  browsers as (
    select browser_family as label, count(distinct visitor_key)::bigint as visitors
    from scoped
    where visitor_key is not null
    group by browser_family
    order by visitors desc, label
  ),
  operating_systems as (
    select operating_system as label, count(distinct visitor_key)::bigint as visitors
    from scoped
    where visitor_key is not null
    group by operating_system
    order by visitors desc, label
  )
  select jsonb_build_object(
    'device', coalesce((select jsonb_agg(to_jsonb(devices)) from devices), '[]'::jsonb),
    'browser', coalesce((select jsonb_agg(to_jsonb(browsers)) from browsers), '[]'::jsonb),
    'operating_system', coalesce((select jsonb_agg(to_jsonb(operating_systems)) from operating_systems), '[]'::jsonb)
  )
  into technical;

  with all_v2 as (
    select *
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.occurred_at >= range_start
      and events.occurred_at < range_end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'traffic_class', grouped.traffic_class,
    'events', grouped.events,
    'visitors', grouped.visitors
  ) order by grouped.events desc, grouped.traffic_class), '[]'::jsonb)
  into traffic_counts
  from (
    select
      traffic_class,
      count(*)::bigint as events,
      count(distinct visitor_key)::bigint as visitors
    from all_v2
    group by traffic_class
  ) as grouped;

  with scoped as (
    select *
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.occurred_at >= range_start
      and events.occurred_at < range_end
      and (
        scope_name = 'all'
        or events.traffic_class = scope_name
        or (
          scope_name = 'automation'
          and events.traffic_class in ('known_bot', 'suspected_automation')
        )
      )
  )
  select jsonb_build_object(
    'verified_events', count(*)::bigint,
    'legacy_events', (
      select count(*)::bigint
      from public.analytics_events as legacy
      where legacy.analytics_schema_version = 1
        and legacy.occurred_at >= range_start
        and legacy.occurred_at < range_end
    ),
    'cutover_at', (
      select min(occurred_at)
      from public.analytics_events
      where analytics_schema_version = 2
    ),
    'latest_verified_event_at', max(scoped.occurred_at),
    'location_eligible_visitors', count(distinct scoped.visitor_key) filter (
      where scoped.visitor_key is not null
    )::bigint,
    'location_verified_visitors', count(distinct scoped.visitor_key) filter (
      where scoped.visitor_key is not null
        and scoped.geo_source = 'cloudflare'
        and scoped.country_code is not null
    )::bigint,
    'location_coverage_percent',
      case
        when count(distinct scoped.visitor_key) filter (
          where scoped.visitor_key is not null
        ) > 0
        then round(
          (
            count(distinct scoped.visitor_key) filter (
              where scoped.visitor_key is not null
                and scoped.geo_source = 'cloudflare'
                and scoped.country_code is not null
            )
          )::numeric * 100.0
          /
          (
            count(distinct scoped.visitor_key) filter (
              where scoped.visitor_key is not null
            )
          )::numeric,
          1
        )
        else null
      end
  )
  into integrity
  from scoped;

  return jsonb_build_object(
    'schema_version', 2,
    'traffic_scope', scope_name,
    'summary', summary,
    'previous_summary', previous_summary,
    'daily_audience', daily_audience,
    'hourly_audience', hourly_audience,
    'geography', geography,
    'acquisition', acquisition,
    'tool_performance', tool_performance,
    'funnel', funnel,
    'technical', technical,
    'traffic_counts', traffic_counts,
    'integrity', integrity
  );
end;
$$;

comment on function public.get_admin_analytics_dashboard(date, date, text) is
  'Returns verified post-cutover aggregate analytics for active Lumeo owners/admins/analysts. Calendar boundaries and hourly/day grouping are evaluated in Asia/Kolkata. Visitor/session keys, raw cookies, IP addresses, full user agents, and document data are never returned. Legacy schema-v1 event counts are surfaced only as data-quality context and are not promoted to verified visitor/geography metrics.';

revoke all on function public.get_admin_analytics_dashboard(date, date, text) from public;
revoke all on function public.get_admin_analytics_dashboard(date, date, text) from anon;
revoke all on function public.get_admin_analytics_dashboard(date, date, text) from authenticated;
grant execute on function public.get_admin_analytics_dashboard(date, date, text) to authenticated;

create or replace function public.get_admin_recent_analytics_events_v2(
  p_limit integer default 50,
  p_traffic_scope text default 'real_audience'
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
  bounded_limit integer;
  scope_name text := lower(trim(coalesce(p_traffic_scope, 'real_audience')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  admin_role := public.current_admin_role();
  if admin_role not in ('owner', 'admin', 'analyst') or not public.is_active_admin() then
    raise exception 'Active administrator access required.';
  end if;

  if scope_name not in ('real_audience', 'synthetic', 'automation', 'all') then
    raise exception 'Unsupported analytics traffic scope.';
  end if;

  bounded_limit := greatest(1, least(coalesce(p_limit, 50), 200));

  return query
    select
      events.occurred_at,
      events.event_name,
      events.tool_slug,
      events.traffic_class,
      events.device_class,
      events.browser_family,
      events.operating_system,
      events.city,
      events.region,
      events.region_code,
      events.country_code,
      events.geo_precision,
      events.page_path,
      events.acquisition_source,
      events.success
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and (
        scope_name = 'all'
        or events.traffic_class = scope_name
        or (
          scope_name = 'automation'
          and events.traffic_class in ('known_bot', 'suspected_automation')
        )
      )
    order by events.occurred_at desc
    limit bounded_limit;
end;
$$;

comment on function public.get_admin_recent_analytics_events_v2(integer, text) is
  'Returns recent verified post-cutover events for active owners/admins/analysts without exposing visitor/session identity, raw cookies, IP addresses, full user agents, secrets, or document data. Unresolved geography remains null and is never fabricated.';

revoke all on function public.get_admin_recent_analytics_events_v2(integer, text) from public;
revoke all on function public.get_admin_recent_analytics_events_v2(integer, text) from anon;
revoke all on function public.get_admin_recent_analytics_events_v2(integer, text) from authenticated;
grant execute on function public.get_admin_recent_analytics_events_v2(integer, text) to authenticated;

comment on table public.analytics_events is
  'Privacy-preserving product analytics. Schema-v1 rows are legacy pre-cutover session/client-geography data. Schema-v2 rows are server-ingested through Lumeo on Cloudflare with pseudonymous visitor/session keys, trusted traffic classification, and Cloudflare-derived approximate geography. No raw IPs, cookie tokens, filenames, exact file sizes, document text, thumbnails, passwords, or full user agents are stored.';

comment on column public.analytics_events.visitor_key is
  'Server-derived HMAC pseudonym for a first-party visitor cookie. The raw cookie token is never stored.';
comment on column public.analytics_events.session_key is
  'Server-derived HMAC pseudonym for a 30-minute sliding first-party analytics session. The raw cookie token is never stored.';
comment on column public.analytics_events.traffic_class is
  'Server-derived classification: real_audience, synthetic, known_bot, or suspected_automation.';
comment on column public.analytics_events.geo_source is
  'cloudflare for verified server-side Cloudflare request geography; unresolved when no country can be verified. Legacy rows remain schema version 1.';
comment on column public.analytics_events.analytics_schema_version is
  '1 = legacy pre-cutover ingestion; 2 = verified Cloudflare server ingestion.';

comment on function public.record_public_analytics_event(
  text, text, uuid, integer, text, text, text, text, text, boolean, text, text, text, text
) is
  'LEGACY pre-cutover browser writer. Its session identity and client-submitted geography are not considered verified visitor/geography data. Kept temporarily for deployment compatibility and scheduled for EXECUTE revocation after the Cloudflare server ingestion path is production-certified.';

commit;
