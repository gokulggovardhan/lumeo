begin;

do $$
begin
  if to_regclass('public.analytics_events') is null then
    raise exception 'Missing required table public.analytics_events.';
  end if;
  if to_regclass('private.analytics_ingest_config') is null then
    raise exception 'Missing trusted analytics foundation migration.';
  end if;
end;
$$;

create or replace function public.record_trusted_analytics_event(
  p_event_name text,
  p_tool_slug text,
  p_visitor_key text,
  p_session_key text,
  p_request_key text,
  p_traffic_class text,
  p_traffic_class_reason text,
  p_duration_ms integer,
  p_input_size_bucket text,
  p_output_size_bucket text,
  p_device_class text,
  p_browser_family text,
  p_operating_system text,
  p_success boolean,
  p_error_code text,
  p_failure_stage text,
  p_country_code text,
  p_region text,
  p_region_code text,
  p_city text,
  p_geo_source text,
  p_geo_precision text,
  p_page_path text
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
  cleaned_input text := coalesce(nullif(lower(trim(p_input_size_bucket)), ''), 'unknown');
  cleaned_output text := coalesce(nullif(lower(trim(p_output_size_bucket)), ''), 'unknown');
  cleaned_device text := coalesce(nullif(lower(trim(p_device_class)), ''), 'unknown');
  cleaned_browser text := coalesce(left(nullif(trim(p_browser_family), ''), 24), 'Unknown');
  cleaned_os text := coalesce(left(nullif(trim(p_operating_system), ''), 24), 'Unknown');
  cleaned_error text := nullif(lower(trim(p_error_code)), '');
  cleaned_stage text := nullif(lower(trim(p_failure_stage)), '');
  cleaned_country text := nullif(upper(left(trim(p_country_code), 2)), '');
  cleaned_region text := nullif(left(trim(p_region), 120), '');
  cleaned_region_code text := nullif(upper(left(trim(p_region_code), 12)), '');
  cleaned_city text := nullif(left(trim(p_city), 120), '');
  cleaned_geo_source text := lower(trim(coalesce(p_geo_source, 'unresolved')));
  cleaned_geo_precision text := lower(trim(coalesce(p_geo_precision, 'unresolved')));
  cleaned_page_path text := nullif(left(trim(p_page_path), 220), '');
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

  if p_visitor_key is null or p_visitor_key !~ '^[A-Za-z0-9_-]{43}$'
     or p_session_key is null or p_session_key !~ '^[A-Za-z0-9_-]{43}$'
     or p_request_key is null or p_request_key !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Invalid analytics identity.';
  end if;

  if cleaned_traffic not in ('real_audience', 'synthetic', 'known_bot', 'suspected_automation') then
    raise exception 'Invalid traffic class.';
  end if;

  if cleaned_tool is not null and (
    cleaned_tool !~ '^[a-z0-9-]{1,80}$'
    or not exists (
      select 1
      from public.pdf_tools as tools
      where tools.slug = cleaned_tool
        and tools.is_enabled = true
        and tools.status in ('active', 'beta')
    )
  ) then
    raise exception 'Unknown analytics tool.';
  end if;

  if cleaned_event <> 'page_view' and cleaned_tool is null then
    raise exception 'Tool events require a tool slug.';
  end if;

  if cleaned_event = 'page_view' and (
    cleaned_page_path is null
    or cleaned_page_path !~ '^/[A-Za-z0-9/_-]*$'
  ) then
    raise exception 'Page views require a safe page path.';
  end if;

  if cleaned_input not in ('under_1mb','1mb_to_5mb','5mb_to_20mb','20mb_to_50mb','over_50mb','unknown') then
    cleaned_input := 'unknown';
  end if;
  if cleaned_output not in ('under_1mb','1mb_to_5mb','5mb_to_20mb','20mb_to_50mb','over_50mb','unknown') then
    cleaned_output := 'unknown';
  end if;
  if cleaned_device not in ('desktop','tablet','mobile','unknown') then
    cleaned_device := 'unknown';
  end if;
  if cleaned_browser not in ('Chrome','Edge','Firefox','Safari','Other','Unknown') then
    cleaned_browser := 'Unknown';
  end if;
  if cleaned_os not in ('Windows','macOS','Linux','Android','iOS','Other','Unknown') then
    cleaned_os := 'Unknown';
  end if;

  if cleaned_error is not null and cleaned_error not in (
    'unsupported_file','file_too_large','invalid_pdf','processing_error',
    'browser_limit','cancelled','input_validation','docx_parse_error',
    'unsupported_document_feature','wasm_load_error','wasm_compile_error',
    'worker_error','font_load_error','render_error','pdf_generation_error',
    'pdf_validation_error','memory_limit','timeout','user_cancelled','unknown'
  ) then
    cleaned_error := 'unknown';
  end if;

  if cleaned_stage is not null and cleaned_stage not in (
    'preparing','loading-engine','converting','generating','validating',
    'finalizing','unknown'
  ) then
    cleaned_stage := 'unknown';
  end if;

  if cleaned_event not in ('processing_failed', 'processing_cancelled') then
    cleaned_stage := null;
  elsif cleaned_stage is null then
    cleaned_stage := 'unknown';
  end if;

  if p_duration_ms is not null then
    bounded_duration := greatest(0, least(p_duration_ms, 86400000));
  end if;

  if cleaned_country is null or cleaned_country !~ '^[A-Z]{2}$' or cleaned_country = 'XX' then
    cleaned_country := null;
    cleaned_region := null;
    cleaned_region_code := null;
    cleaned_city := null;
    cleaned_geo_source := 'unresolved';
    cleaned_geo_precision := 'unresolved';
  elsif cleaned_geo_source <> 'cloudflare' then
    cleaned_country := null;
    cleaned_region := null;
    cleaned_region_code := null;
    cleaned_city := null;
    cleaned_geo_source := 'unresolved';
    cleaned_geo_precision := 'unresolved';
  elsif cleaned_city is not null then
    cleaned_geo_precision := 'city';
  elsif cleaned_region is not null or cleaned_region_code is not null then
    cleaned_geo_precision := 'region';
  else
    cleaned_geo_precision := 'country';
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
      and (
        cleaned_event <> 'page_view'
        or coalesce(events.page_path, '') = coalesce(cleaned_page_path, '')
      )
      and events.occurred_at > now() - interval '3 seconds'
  ) then
    return true;
  end if;

  insert into public.analytics_events (
    event_name, tool_slug, anonymous_session_id, occurred_at, duration_ms,
    input_size_bucket, output_size_bucket, device_class, browser_family,
    operating_system, country_code, success, error_code, metadata, region,
    city, visitor_key, session_key, traffic_class, traffic_class_reason,
    geo_source, geo_precision, region_code, page_path, analytics_schema_version,
    failure_stage
  )
  values (
    cleaned_event, cleaned_tool, null, now(), bounded_duration,
    cleaned_input, cleaned_output, cleaned_device, cleaned_browser,
    cleaned_os, cleaned_country, p_success, cleaned_error, '{}'::jsonb,
    cleaned_region, cleaned_city, p_visitor_key, p_session_key, cleaned_traffic,
    cleaned_reason, cleaned_geo_source, cleaned_geo_precision,
    cleaned_region_code, cleaned_page_path, 2, cleaned_stage
  );

  return true;
end;
$$;

revoke all on function public.record_trusted_analytics_event(
  text,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,
  text,text,text,text,text,text,text,text,text
) from public;
revoke all on function public.record_trusted_analytics_event(
  text,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,
  text,text,text,text,text,text,text,text,text
) from anon;
revoke all on function public.record_trusted_analytics_event(
  text,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,
  text,text,text,text,text,text,text,text,text
) from authenticated;
grant execute on function public.record_trusted_analytics_event(
  text,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,
  text,text,text,text,text,text,text,text,text
) to anon;
grant execute on function public.record_trusted_analytics_event(
  text,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,
  text,text,text,text,text,text,text,text,text
) to authenticated;

create or replace function public.get_admin_verified_analytics(
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
  scope_name text := lower(trim(coalesce(p_traffic_scope, 'real_audience')));
  summary jsonb;
  daily jsonb;
  geography jsonb;
  tools jsonb;
  diagnostics jsonb;
  technical jsonb;
  top_pages jsonb;
  traffic_counts jsonb;
  integrity jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  admin_role := public.current_admin_role();
  if admin_role not in ('owner', 'admin', 'analyst') or not public.is_active_admin() then
    raise exception 'Active administrator access required.';
  end if;

  if p_start_date is null or p_end_date is null
     or p_end_date < p_start_date
     or p_end_date - p_start_date > 89 then
    raise exception 'Invalid analytics date range.';
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
        or (scope_name = 'automation' and e.traffic_class in ('known_bot','suspected_automation'))
      )
  ),
  page_views as (
    select *,
      (
        geo_source = 'cloudflare'
        and country_code is not null
        and city is not null
        and (region is not null or region_code is not null)
      ) as complete_location
    from scoped
    where event_name = 'page_view'
  )
  select jsonb_build_object(
    'page_views', count(*)::bigint,
    'unique_visitors', count(distinct visitor_key)::bigint,
    'sessions', count(distinct session_key)::bigint,
    'known_location_page_views', count(*) filter (where complete_location)::bigint,
    'unknown_location_page_views', count(*) filter (where not complete_location)::bigint,
    'location_coverage_percent',
      case when count(*) > 0
        then round((count(*) filter (where complete_location))::numeric * 100.0 / count(*)::numeric, 1)
        else null end,
    'tool_opens', (select count(*)::bigint from scoped where event_name='tool_opened'),
    'processing_started', (select count(*)::bigint from scoped where event_name='processing_started'),
    'processing_succeeded', (select count(*)::bigint from scoped where event_name='processing_succeeded'),
    'processing_failed', (select count(*)::bigint from scoped where event_name='processing_failed'),
    'processing_cancelled', (select count(*)::bigint from scoped where event_name='processing_cancelled'),
    'downloads_started', (select count(*)::bigint from scoped where event_name='download_started'),
    'average_successful_duration_ms', (
      select case when count(*) filter (where duration_ms is not null) > 0
        then round(avg(duration_ms) filter (where duration_ms is not null))::bigint
        else null end
      from scoped where event_name='processing_succeeded'
    ),
    'latest_event_at', (select max(occurred_at) from scoped)
  )
  into summary
  from page_views;

  with days as (
    select generate_series(p_start_date, p_end_date, interval '1 day')::date as metric_date
  ),
  scoped as (
    select *,
      (occurred_at at time zone 'Asia/Kolkata')::date as event_date,
      (
        geo_source = 'cloudflare'
        and country_code is not null
        and city is not null
        and (region is not null or region_code is not null)
      ) as complete_location
    from public.analytics_events e
    where e.analytics_schema_version = 2
      and e.occurred_at >= range_start and e.occurred_at < range_end
      and (
        scope_name = 'all'
        or e.traffic_class = scope_name
        or (scope_name='automation' and e.traffic_class in ('known_bot','suspected_automation'))
      )
  ),
  grouped as (
    select
      event_date,
      count(*) filter (where event_name='page_view')::bigint as page_views,
      count(distinct visitor_key) filter (where event_name='page_view')::bigint as unique_visitors,
      count(distinct session_key) filter (where event_name='page_view')::bigint as sessions,
      count(*) filter (where event_name='page_view' and complete_location)::bigint as known_location_page_views,
      count(*) filter (where event_name='page_view' and not complete_location)::bigint as unknown_location_page_views,
      count(*) filter (where event_name='tool_opened')::bigint as tool_opens,
      count(*) filter (where event_name='processing_started')::bigint as processing_started,
      count(*) filter (where event_name='processing_succeeded')::bigint as processing_succeeded,
      count(*) filter (where event_name='processing_failed')::bigint as processing_failed,
      count(*) filter (where event_name='processing_cancelled')::bigint as processing_cancelled,
      count(*) filter (where event_name='download_started')::bigint as downloads_started
    from scoped
    group by event_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', days.metric_date,
    'page_views', coalesce(grouped.page_views,0),
    'unique_visitors', coalesce(grouped.unique_visitors,0),
    'sessions', coalesce(grouped.sessions,0),
    'known_location_page_views', coalesce(grouped.known_location_page_views,0),
    'unknown_location_page_views', coalesce(grouped.unknown_location_page_views,0),
    'tool_opens', coalesce(grouped.tool_opens,0),
    'processing_started', coalesce(grouped.processing_started,0),
    'processing_succeeded', coalesce(grouped.processing_succeeded,0),
    'processing_failed', coalesce(grouped.processing_failed,0),
    'processing_cancelled', coalesce(grouped.processing_cancelled,0),
    'downloads_started', coalesce(grouped.downloads_started,0)
  ) order by days.metric_date), '[]'::jsonb)
  into daily
  from days left join grouped on grouped.event_date = days.metric_date;

  with page_views as (
    select *
    from public.analytics_events e
    where e.analytics_schema_version=2
      and e.event_name='page_view'
      and e.occurred_at >= range_start and e.occurred_at < range_end
      and (
        scope_name='all'
        or e.traffic_class=scope_name
        or (scope_name='automation' and e.traffic_class in ('known_bot','suspected_automation'))
      )
  ),
  locations as (
    select city, region, region_code, country_code,
      count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors,
      count(distinct session_key)::bigint as sessions
    from page_views
    where geo_source='cloudflare'
      and country_code is not null
      and city is not null
      and (region is not null or region_code is not null)
    group by city, region, region_code, country_code
    order by page_views desc, country_code, region, city
    limit 100
  ),
  countries as (
    select country_code,
      count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors,
      count(distinct session_key)::bigint as sessions
    from page_views
    where geo_source='cloudflare' and country_code is not null
    group by country_code
    order by page_views desc, country_code
    limit 100
  ),
  regions as (
    select country_code, region, region_code,
      count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors,
      count(distinct session_key)::bigint as sessions
    from page_views
    where geo_source='cloudflare'
      and country_code is not null
      and (region is not null or region_code is not null)
    group by country_code, region, region_code
    order by page_views desc, country_code, region, region_code
    limit 200
  ),
  cities as (
    select country_code, region, region_code, city,
      count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors,
      count(distinct session_key)::bigint as sessions
    from page_views
    where geo_source='cloudflare'
      and country_code is not null
      and city is not null
      and (region is not null or region_code is not null)
    group by country_code, region, region_code, city
    order by page_views desc, country_code, region, city
    limit 300
  )
  select jsonb_build_object(
    'locations', coalesce((select jsonb_agg(to_jsonb(locations)) from locations), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(to_jsonb(countries)) from countries), '[]'::jsonb),
    'regions', coalesce((select jsonb_agg(to_jsonb(regions)) from regions), '[]'::jsonb),
    'cities', coalesce((select jsonb_agg(to_jsonb(cities)) from cities), '[]'::jsonb)
  ) into geography;

  with scoped as (
    select *
    from public.analytics_events e
    where e.analytics_schema_version=2
      and e.occurred_at >= range_start and e.occurred_at < range_end
      and e.tool_slug is not null
      and (
        scope_name='all'
        or e.traffic_class=scope_name
        or (scope_name='automation' and e.traffic_class in ('known_bot','suspected_automation'))
      )
  ),
  opened as (
    select tool_slug, count(*)::bigint as event_count
    from scoped where event_name='tool_opened'
    group by tool_slug order by event_count desc, tool_slug limit 50
  ),
  succeeded as (
    select tool_slug, count(*)::bigint as event_count
    from scoped where event_name='processing_succeeded'
    group by tool_slug order by event_count desc, tool_slug limit 50
  )
  select jsonb_build_object(
    'top_tools_by_opens', coalesce((select jsonb_agg(to_jsonb(opened)) from opened), '[]'::jsonb),
    'top_tools_by_success', coalesce((select jsonb_agg(to_jsonb(succeeded)) from succeeded), '[]'::jsonb)
  ) into tools;

  with scoped as (
    select *
    from public.analytics_events e
    where e.analytics_schema_version=2
      and e.occurred_at >= range_start and e.occurred_at < range_end
      and (
        scope_name='all'
        or e.traffic_class=scope_name
        or (scope_name='automation' and e.traffic_class in ('known_bot','suspected_automation'))
      )
  ),
  errors as (
    select coalesce(error_code,'unknown') as label, count(*)::bigint as event_count
    from scoped where event_name='processing_failed'
    group by coalesce(error_code,'unknown')
    order by event_count desc, label
  ),
  failure_stages as (
    select coalesce(failure_stage,'unknown') as label, count(*)::bigint as event_count
    from scoped where event_name='processing_failed'
    group by coalesce(failure_stage,'unknown')
    order by event_count desc, label
  ),
  cancellation_stages as (
    select coalesce(failure_stage,'unknown') as label, count(*)::bigint as event_count
    from scoped where event_name='processing_cancelled'
    group by coalesce(failure_stage,'unknown')
    order by event_count desc, label
  )
  select jsonb_build_object(
    'errors', coalesce((select jsonb_agg(to_jsonb(errors)) from errors), '[]'::jsonb),
    'failure_stages', coalesce((select jsonb_agg(to_jsonb(failure_stages)) from failure_stages), '[]'::jsonb),
    'cancellation_stages', coalesce((select jsonb_agg(to_jsonb(cancellation_stages)) from cancellation_stages), '[]'::jsonb)
  ) into diagnostics;

  with page_views as (
    select *
    from public.analytics_events e
    where e.analytics_schema_version=2
      and e.event_name='page_view'
      and e.occurred_at >= range_start and e.occurred_at < range_end
      and (
        scope_name='all'
        or e.traffic_class=scope_name
        or (scope_name='automation' and e.traffic_class in ('known_bot','suspected_automation'))
      )
  ),
  devices as (
    select device_class as label, count(distinct visitor_key)::bigint as visitors
    from page_views group by device_class order by visitors desc, label
  ),
  browsers as (
    select browser_family as label, count(distinct visitor_key)::bigint as visitors
    from page_views group by browser_family order by visitors desc, label
  ),
  systems as (
    select operating_system as label, count(distinct visitor_key)::bigint as visitors
    from page_views group by operating_system order by visitors desc, label
  )
  select jsonb_build_object(
    'device', coalesce((select jsonb_agg(to_jsonb(devices)) from devices), '[]'::jsonb),
    'browser', coalesce((select jsonb_agg(to_jsonb(browsers)) from browsers), '[]'::jsonb),
    'operating_system', coalesce((select jsonb_agg(to_jsonb(systems)) from systems), '[]'::jsonb)
  ) into technical;

  with pages as (
    select page_path,
      count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors,
      count(distinct session_key)::bigint as sessions
    from public.analytics_events e
    where e.analytics_schema_version=2
      and e.event_name='page_view'
      and e.page_path is not null
      and e.occurred_at >= range_start and e.occurred_at < range_end
      and (
        scope_name='all'
        or e.traffic_class=scope_name
        or (scope_name='automation' and e.traffic_class in ('known_bot','suspected_automation'))
      )
    group by page_path
    order by page_views desc, page_path
    limit 50
  )
  select coalesce(jsonb_agg(to_jsonb(pages)), '[]'::jsonb)
  into top_pages from pages;

  with all_v2 as (
    select *
    from public.analytics_events e
    where e.analytics_schema_version=2
      and e.event_name='page_view'
      and e.occurred_at >= range_start and e.occurred_at < range_end
  ),
  grouped as (
    select traffic_class, count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors,
      count(distinct session_key)::bigint as sessions
    from all_v2
    group by traffic_class
    order by page_views desc, traffic_class
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb)
  into traffic_counts from grouped;

  select jsonb_build_object(
    'legacy_page_views', (
      select count(*)::bigint from public.analytics_events e
      where e.analytics_schema_version=1
        and e.event_name='page_view'
        and e.occurred_at >= range_start and e.occurred_at < range_end
    ),
    'cutover_at', (
      select min(e.occurred_at) from public.analytics_events e
      where e.analytics_schema_version=2
    ),
    'excluded_automation_page_views', (
      select count(*)::bigint from public.analytics_events e
      where e.analytics_schema_version=2
        and e.event_name='page_view'
        and e.occurred_at >= range_start and e.occurred_at < range_end
        and e.traffic_class in ('synthetic','known_bot','suspected_automation')
    )
  ) into integrity;

  return jsonb_build_object(
    'schema_version', 2,
    'traffic_scope', scope_name,
    'summary', summary,
    'daily', daily,
    'geography', geography,
    'tools', tools,
    'diagnostics', diagnostics,
    'technical', technical,
    'top_pages', top_pages,
    'traffic_counts', traffic_counts,
    'integrity', integrity
  );
end;
$$;

revoke all on function public.get_admin_verified_analytics(date,date,text) from public;
revoke all on function public.get_admin_verified_analytics(date,date,text) from anon;
revoke all on function public.get_admin_verified_analytics(date,date,text) from authenticated;
grant execute on function public.get_admin_verified_analytics(date,date,text) to authenticated;

comment on function public.record_trusted_analytics_event(
  text,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,
  text,text,text,text,text,text,text,text,text
) is
  'Trusted Lumeo server analytics writer. Geography and traffic classification arrive only from the Lumeo Cloudflare application. Raw IPs, raw visitor/session cookies, precise coordinates, addresses, filenames, and document content are never stored.';

comment on function public.get_admin_verified_analytics(date,date,text) is
  'Verified schema-v2 analytics for active administrators. Default real_audience scope excludes Lumeo synthetic browser tests and known/suspected automation. All date boundaries use Asia/Kolkata. Full-location reporting requires genuine city + region + country; incomplete geography remains counted in Unknown Location.';

-- The legacy writer stays executable during the rolling deploy so cached pre-cutover
-- clients fail open rather than breaking product workflows. Verified Admin Analytics
-- ignores schema-v1 rows. Revoke the legacy writer only after schema-v2 production
-- ingestion is certified.
commit;
