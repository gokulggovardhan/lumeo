begin;

-- Activate the already-present schema-v2 analytics foundation with the
-- current production event vocabulary. This supersedes the dormant
-- September server-ingest signature; the browser never supplies geography,
-- visitor/session keys, user-agent classification, or raw network identity.
drop function if exists public.record_server_analytics_event(
  text, text, text, text, text, text, text, integer, text, text, text, text,
  text, boolean, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text
);

create function public.record_server_analytics_event(
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
  p_utm_campaign text default null,
  p_failure_stage text default null
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
  cleaned_failure_stage text := nullif(lower(trim(p_failure_stage)), '');
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
    'processing_cancelled',
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
    'under_1mb', '1mb_to_5mb', '5mb_to_20mb', '20mb_to_50mb',
    'over_50mb', 'unknown'
  ) then
    cleaned_input_bucket := 'unknown';
  end if;
  if cleaned_output_bucket not in (
    'under_1mb', '1mb_to_5mb', '5mb_to_20mb', '20mb_to_50mb',
    'over_50mb', 'unknown'
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

  if cleaned_failure_stage is not null and cleaned_failure_stage not in (
    'preparing',
    'loading-engine',
    'converting',
    'generating',
    'validating',
    'finalizing',
    'unknown'
  ) then
    cleaned_failure_stage := 'unknown';
  end if;
  if cleaned_event not in ('processing_failed', 'processing_cancelled') then
    cleaned_failure_stage := null;
  elsif cleaned_failure_stage is null then
    cleaned_failure_stage := 'unknown';
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

  -- No country means the location is unresolved. Never keep or manufacture a
  -- city/region without a trusted country anchor.
  if cleaned_country is null or cleaned_country !~ '^[A-Z]{2}$' then
    cleaned_country := null;
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
  if cleaned_event = 'page_view' and cleaned_page_path is null then
    raise exception 'Page views require a valid page path.';
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
    'direct', 'google', 'bing', 'other_search', 'referral', 'campaign'
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

  -- Suppress duplicate initialization/retry events without suppressing a
  -- genuine fast navigation to a different page.
  if exists (
    select 1
    from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.session_key = p_session_key
      and events.event_name = cleaned_event
      and coalesce(events.tool_slug, '') = coalesce(cleaned_tool, '')
      and coalesce(events.page_path, '') = coalesce(cleaned_page_path, '')
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
    failure_stage,
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
    cleaned_failure_stage,
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

revoke all on function public.record_server_analytics_event(
  text, text, text, text, text, text, text, integer, text, text, text, text,
  text, boolean, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text
) from public;
grant execute on function public.record_server_analytics_event(
  text, text, text, text, text, text, text, integer, text, text, text, text,
  text, boolean, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text
) to anon;
grant execute on function public.record_server_analytics_event(
  text, text, text, text, text, text, text, integer, text, text, text, text,
  text, boolean, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text
) to authenticated;

create or replace function public.get_admin_verified_traffic(
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
  scope_name text := lower(trim(coalesce(p_traffic_scope, 'real_audience')));
  range_start timestamptz;
  range_end timestamptz;
  summary jsonb;
  daily jsonb;
  locations jsonb;
  countries jsonb;
  regions jsonb;
  cities jsonb;
  top_pages jsonb;
  top_tools_open jsonb;
  top_tools_success jsonb;
  errors jsonb;
  failure_stages jsonb;
  cancellation_stages jsonb;
  device_summary jsonb;
  browser_summary jsonb;
  os_summary jsonb;
  traffic_counts jsonb;
  integrity jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  admin_role := public.current_admin_role();
  if admin_role not in ('owner', 'admin', 'analyst')
     or not public.is_active_admin() then
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

  with scoped as (
    select *
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
  totals as (
    select
      count(*) filter (where event_name = 'page_view')::bigint as page_views,
      count(distinct visitor_key) filter (where event_name = 'page_view')::bigint as visitors,
      count(distinct session_key) filter (where event_name = 'page_view')::bigint as sessions,
      count(*) filter (
        where event_name = 'page_view'
          and geo_source = 'cloudflare'
          and country_code is not null
          and city is not null
          and (region is not null or region_code is not null)
      )::bigint as known_location_page_views,
      count(*) filter (where event_name = 'tool_opened')::bigint as tool_opens,
      count(*) filter (where event_name = 'processing_started')::bigint as processing_started,
      count(*) filter (where event_name = 'processing_succeeded')::bigint as processing_succeeded,
      count(*) filter (where event_name = 'processing_failed')::bigint as processing_failed,
      count(*) filter (where event_name = 'processing_cancelled')::bigint as processing_cancelled,
      count(*) filter (where event_name = 'download_started')::bigint as downloads_started,
      case
        when count(*) filter (
          where event_name = 'processing_succeeded' and duration_ms is not null
        ) > 0
        then round(avg(duration_ms) filter (
          where event_name = 'processing_succeeded' and duration_ms is not null
        ))::bigint
        else null
      end as average_successful_duration_ms,
      max(occurred_at) as latest_event_at
    from scoped
  )
  select jsonb_build_object(
    'page_views', page_views,
    'unique_visitors', visitors,
    'sessions', sessions,
    'known_location_page_views', known_location_page_views,
    'unknown_location_page_views', page_views - known_location_page_views,
    'tool_opens', tool_opens,
    'processing_started', processing_started,
    'processing_succeeded', processing_succeeded,
    'processing_failed', processing_failed,
    'processing_cancelled', processing_cancelled,
    'downloads_started', downloads_started,
    'average_successful_duration_ms', average_successful_duration_ms,
    'latest_event_at', latest_event_at
  )
  into summary
  from totals;

  with days as (
    select generate_series(p_start_date, p_end_date, interval '1 day')::date as day
  ),
  scoped as (
    select *
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
  grouped as (
    select
      (occurred_at at time zone 'Asia/Kolkata')::date as day,
      count(*) filter (where event_name = 'page_view')::bigint as page_views,
      count(distinct visitor_key) filter (where event_name = 'page_view')::bigint as visitors,
      count(distinct session_key) filter (where event_name = 'page_view')::bigint as sessions,
      count(*) filter (where event_name = 'tool_opened')::bigint as tool_opens,
      count(*) filter (where event_name = 'processing_succeeded')::bigint as processing_succeeded,
      count(*) filter (where event_name = 'processing_failed')::bigint as processing_failed,
      count(*) filter (where event_name = 'processing_cancelled')::bigint as processing_cancelled,
      count(*) filter (
        where event_name = 'page_view'
          and geo_source = 'cloudflare'
          and country_code is not null
          and city is not null
          and (region is not null or region_code is not null)
      )::bigint as known_location_page_views
    from scoped
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', days.day,
    'page_views', coalesce(grouped.page_views, 0),
    'unique_visitors', coalesce(grouped.visitors, 0),
    'sessions', coalesce(grouped.sessions, 0),
    'tool_opens', coalesce(grouped.tool_opens, 0),
    'processing_succeeded', coalesce(grouped.processing_succeeded, 0),
    'processing_failed', coalesce(grouped.processing_failed, 0),
    'processing_cancelled', coalesce(grouped.processing_cancelled, 0),
    'known_location_page_views', coalesce(grouped.known_location_page_views, 0),
    'unknown_location_page_views',
      coalesce(grouped.page_views, 0) - coalesce(grouped.known_location_page_views, 0)
  ) order by days.day), '[]'::jsonb)
  into daily
  from days
  left join grouped using (day);

  with scoped_pages as (
    select *
    from public.analytics_events e
    where e.analytics_schema_version = 2
      and e.event_name = 'page_view'
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
  grouped as (
    select
      city,
      coalesce(region, region_code) as region,
      region_code,
      country_code,
      count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors,
      count(distinct session_key)::bigint as sessions
    from scoped_pages
    where geo_source = 'cloudflare'
      and country_code is not null
      and city is not null
      and (region is not null or region_code is not null)
    group by city, coalesce(region, region_code), region_code, country_code
    order by page_views desc, visitors desc, city asc
    limit 50
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb)
  into locations
  from grouped;

  with scoped_pages as (
    select *
    from public.analytics_events e
    where e.analytics_schema_version = 2
      and e.event_name = 'page_view'
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
  grouped as (
    select
      country_code,
      count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors,
      count(distinct session_key)::bigint as sessions
    from scoped_pages
    where geo_source = 'cloudflare' and country_code is not null
    group by country_code
    order by page_views desc, country_code
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb)
  into countries
  from grouped;

  with scoped_pages as (
    select *
    from public.analytics_events e
    where e.analytics_schema_version = 2
      and e.event_name = 'page_view'
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
  grouped as (
    select
      country_code,
      coalesce(region, region_code) as region,
      region_code,
      count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors,
      count(distinct session_key)::bigint as sessions
    from scoped_pages
    where geo_source = 'cloudflare'
      and country_code is not null
      and (region is not null or region_code is not null)
    group by country_code, coalesce(region, region_code), region_code
    order by page_views desc, country_code, region
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb)
  into regions
  from grouped;

  with scoped_pages as (
    select *
    from public.analytics_events e
    where e.analytics_schema_version = 2
      and e.event_name = 'page_view'
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
  grouped as (
    select
      country_code,
      city,
      coalesce(region, region_code) as region,
      region_code,
      count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors,
      count(distinct session_key)::bigint as sessions
    from scoped_pages
    where geo_source = 'cloudflare'
      and country_code is not null
      and city is not null
      and (region is not null or region_code is not null)
    group by country_code, city, coalesce(region, region_code), region_code
    order by page_views desc, country_code, city
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb)
  into cities
  from grouped;

  with scoped_pages as (
    select *
    from public.analytics_events e
    where e.analytics_schema_version = 2
      and e.event_name = 'page_view'
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
  grouped as (
    select
      page_path,
      count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors,
      count(distinct session_key)::bigint as sessions
    from scoped_pages
    where page_path is not null
    group by page_path
    order by page_views desc, page_path
    limit 25
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb)
  into top_pages
  from grouped;

  with scoped as (
    select *
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
  grouped as (
    select tool_slug, count(*)::bigint as event_count
    from scoped
    where event_name = 'tool_opened' and tool_slug is not null
    group by tool_slug
    order by event_count desc, tool_slug
    limit 15
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb)
  into top_tools_open
  from grouped;

  with scoped as (
    select *
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
  grouped as (
    select tool_slug, count(*)::bigint as event_count
    from scoped
    where event_name = 'processing_succeeded' and tool_slug is not null
    group by tool_slug
    order by event_count desc, tool_slug
    limit 15
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb)
  into top_tools_success
  from grouped;

  with scoped as (
    select *
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
  grouped as (
    select coalesce(error_code, 'unknown') as label, count(*)::bigint as event_count
    from scoped
    where event_name = 'processing_failed'
    group by coalesce(error_code, 'unknown')
    order by event_count desc, label
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb)
  into errors
  from grouped;

  with scoped as (
    select *
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
  grouped as (
    select coalesce(failure_stage, 'unknown') as label, count(*)::bigint as event_count
    from scoped
    where event_name = 'processing_failed'
    group by coalesce(failure_stage, 'unknown')
    order by event_count desc, label
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb)
  into failure_stages
  from grouped;

  with scoped as (
    select *
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
  grouped as (
    select coalesce(failure_stage, 'unknown') as label, count(*)::bigint as event_count
    from scoped
    where event_name = 'processing_cancelled'
    group by coalesce(failure_stage, 'unknown')
    order by event_count desc, label
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb)
  into cancellation_stages
  from grouped;

  with scoped as (
    select *
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
  grouped as (
    select coalesce(device_class, 'unknown') as label,
      count(distinct visitor_key)::bigint as visitors
    from scoped where visitor_key is not null
    group by coalesce(device_class, 'unknown')
    order by visitors desc, label
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb)
  into device_summary from grouped;

  with scoped as (
    select *
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
  grouped as (
    select coalesce(browser_family, 'Unknown') as label,
      count(distinct visitor_key)::bigint as visitors
    from scoped where visitor_key is not null
    group by coalesce(browser_family, 'Unknown')
    order by visitors desc, label
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb)
  into browser_summary from grouped;

  with scoped as (
    select *
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
  grouped as (
    select coalesce(operating_system, 'Unknown') as label,
      count(distinct visitor_key)::bigint as visitors
    from scoped where visitor_key is not null
    group by coalesce(operating_system, 'Unknown')
    order by visitors desc, label
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb)
  into os_summary from grouped;

  with all_v2 as (
    select *
    from public.analytics_events e
    where e.analytics_schema_version = 2
      and e.occurred_at >= range_start
      and e.occurred_at < range_end
  ),
  grouped as (
    select
      traffic_class,
      count(*)::bigint as events,
      count(*) filter (where event_name = 'page_view')::bigint as page_views,
      count(distinct visitor_key) filter (where event_name = 'page_view')::bigint as visitors,
      count(distinct session_key) filter (where event_name = 'page_view')::bigint as sessions
    from all_v2
    group by traffic_class
    order by page_views desc, events desc, traffic_class
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb)
  into traffic_counts
  from grouped;

  with scoped as (
    select *
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
  )
  select jsonb_build_object(
    'verified_events', count(*)::bigint,
    'legacy_events', (
      select count(*)::bigint from public.analytics_events legacy
      where legacy.analytics_schema_version = 1
        and legacy.occurred_at >= range_start
        and legacy.occurred_at < range_end
    ),
    'legacy_page_views', (
      select count(*)::bigint from public.analytics_events legacy
      where legacy.analytics_schema_version = 1
        and legacy.event_name = 'page_view'
        and legacy.occurred_at >= range_start
        and legacy.occurred_at < range_end
    ),
    'cutover_at', (
      select min(occurred_at) from public.analytics_events
      where analytics_schema_version = 2
    ),
    'latest_verified_event_at', max(scoped.occurred_at),
    'location_coverage_percent',
      case
        when count(*) filter (where event_name = 'page_view') > 0
        then round(
          (
            count(*) filter (
              where event_name = 'page_view'
                and geo_source = 'cloudflare'
                and country_code is not null
                and city is not null
                and (region is not null or region_code is not null)
            )
          )::numeric * 100.0
          /
          (count(*) filter (where event_name = 'page_view'))::numeric,
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
    'daily', daily,
    'locations', locations,
    'countries', countries,
    'regions', regions,
    'cities', cities,
    'top_pages', top_pages,
    'top_tools_by_opens', top_tools_open,
    'top_tools_by_success', top_tools_success,
    'error_summary', errors,
    'failure_stage_summary', failure_stages,
    'cancellation_stage_summary', cancellation_stages,
    'device_summary', device_summary,
    'browser_summary', browser_summary,
    'operating_system_summary', os_summary,
    'traffic_counts', traffic_counts,
    'integrity', integrity
  );
end;
$$;

revoke all on function public.get_admin_verified_traffic(date, date, text) from public;
revoke all on function public.get_admin_verified_traffic(date, date, text) from anon;
revoke all on function public.get_admin_verified_traffic(date, date, text) from authenticated;
grant execute on function public.get_admin_verified_traffic(date, date, text) to authenticated;

-- Once the server writer is deployed, legacy browser-submitted geography must
-- not continue creating schema-v1 rows. A short rollout gap is preferable to
-- contaminating trusted audience/location analytics.
revoke execute on function public.record_public_analytics_event(
  text, text, uuid, integer, text, text, text, text, text, boolean, text, text,
  text, text
) from anon, authenticated;
revoke execute on function public.record_public_analytics_event(
  text, text, uuid, integer, text, text, text, text, text, boolean, text, text,
  text, text, text
) from anon, authenticated;

commit;
