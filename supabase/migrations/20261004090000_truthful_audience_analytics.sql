begin;

-- Server-ingested schema-v2 writer aligned with the current conversion
-- lifecycle contract. Geography and traffic class are supplied only by the
-- Lumeo Cloudflare route; the ingest secret is validated from the HTTP
-- request header and raw IP/cookie tokens are never stored.
create or replace function public.record_server_analytics_event_v2(
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
  cleaned_input text := coalesce(nullif(lower(trim(p_input_size_bucket)), ''), 'unknown');
  cleaned_output text := coalesce(nullif(lower(trim(p_output_size_bucket)), ''), 'unknown');
  cleaned_device text := coalesce(nullif(lower(trim(p_device_class)), ''), 'unknown');
  cleaned_browser text := coalesce(left(nullif(trim(p_browser_family), ''), 24), 'Unknown');
  cleaned_os text := coalesce(left(nullif(trim(p_operating_system), ''), 24), 'Unknown');
  cleaned_error text := nullif(lower(trim(p_error_code)), '');
  cleaned_stage text := nullif(lower(trim(p_failure_stage)), '');
  cleaned_country text := nullif(upper(trim(p_country_code)), '');
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
  request_count integer;
  session_recent_count integer;
begin
  request_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  supplied_secret := request_headers ->> 'x-lumeo-analytics-ingest';

  select config.secret_hash into expected_hash
  from private.analytics_ingest_config as config
  where config.singleton = true;

  if expected_hash is null
     or supplied_secret is null
     or extensions.digest(supplied_secret, 'sha256') <> expected_hash then
    raise exception 'Analytics ingestion authorization failed.';
  end if;

  if not exists (
    select 1 from public.site_settings as settings
    where settings.key = 'public_analytics_enabled'
      and settings.is_public = true
      and settings.value @> '{"enabled": true}'::jsonb
  ) then
    return false;
  end if;

  if cleaned_event not in (
    'page_view','tool_opened','processing_started','processing_succeeded',
    'processing_failed','processing_cancelled','download_started'
  ) then
    raise exception 'Unsupported analytics event.';
  end if;

  if p_visitor_key is null or p_visitor_key !~ '^[A-Za-z0-9_-]{43}$'
     or p_session_key is null or p_session_key !~ '^[A-Za-z0-9_-]{43}$'
     or p_request_key is null or p_request_key !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Invalid analytics identity.';
  end if;

  if cleaned_traffic not in ('real_audience','synthetic','known_bot','suspected_automation') then
    raise exception 'Invalid traffic class.';
  end if;

  if cleaned_tool is not null and (
    cleaned_tool !~ '^[a-z0-9-]{1,80}$'
    or not exists (
      select 1 from public.pdf_tools as tools
      where tools.slug = cleaned_tool
        and tools.is_enabled = true
        and tools.status in ('active','beta')
    )
  ) then
    raise exception 'Unknown analytics tool.';
  end if;
  if cleaned_event <> 'page_view' and cleaned_tool is null then
    raise exception 'Tool events require a tool slug.';
  end if;

  if cleaned_input not in ('under_1mb','1mb_to_5mb','5mb_to_20mb','20mb_to_50mb','over_50mb','unknown') then cleaned_input := 'unknown'; end if;
  if cleaned_output not in ('under_1mb','1mb_to_5mb','5mb_to_20mb','20mb_to_50mb','over_50mb','unknown') then cleaned_output := 'unknown'; end if;
  if cleaned_device not in ('desktop','tablet','mobile','unknown') then cleaned_device := 'unknown'; end if;
  if cleaned_browser not in ('Chrome','Edge','Firefox','Safari','Other','Unknown') then cleaned_browser := 'Unknown'; end if;
  if cleaned_os not in ('Windows','macOS','Linux','Android','iOS','Other','Unknown') then cleaned_os := 'Unknown'; end if;

  if cleaned_error is not null and cleaned_error not in (
    'unsupported_file','file_too_large','invalid_pdf','processing_error','browser_limit','cancelled',
    'input_validation','docx_parse_error','unsupported_document_feature','wasm_load_error',
    'wasm_compile_error','worker_error','font_load_error','render_error','pdf_generation_error',
    'pdf_validation_error','memory_limit','timeout','user_cancelled','unknown'
  ) then cleaned_error := 'unknown'; end if;

  if cleaned_stage is not null and cleaned_stage not in (
    'preparing','loading-engine','converting','generating','validating','finalizing','unknown'
  ) then cleaned_stage := 'unknown'; end if;
  if cleaned_event not in ('processing_failed','processing_cancelled') then cleaned_stage := null; end if;

  if p_duration_ms is not null then
    bounded_duration := greatest(0, least(p_duration_ms, 86400000));
  end if;

  if cleaned_country is null or cleaned_country !~ '^[A-Z]{2}$' then
    cleaned_country := null;
    cleaned_region := null;
    cleaned_region_code := null;
    cleaned_city := null;
    cleaned_geo_source := 'unresolved';
    cleaned_geo_precision := 'unresolved';
  elsif cleaned_city is not null then
    cleaned_geo_source := 'cloudflare'; cleaned_geo_precision := 'city';
  elsif cleaned_region is not null or cleaned_region_code is not null then
    cleaned_geo_source := 'cloudflare'; cleaned_geo_precision := 'region';
  else
    cleaned_geo_source := 'cloudflare'; cleaned_geo_precision := 'country';
  end if;

  if cleaned_page_path is not null and cleaned_page_path !~ '^/[A-Za-z0-9/_-]*$' then cleaned_page_path := null; end if;
  if cleaned_landing_path is not null and cleaned_landing_path !~ '^/[A-Za-z0-9/_-]*$' then cleaned_landing_path := null; end if;
  if cleaned_referrer_host is not null and cleaned_referrer_host !~ '^[a-z0-9.-]+$' then cleaned_referrer_host := null; end if;
  if cleaned_acquisition not in ('direct','google','bing','other_search','referral','campaign') then cleaned_acquisition := 'direct'; end if;

  delete from private.analytics_ingest_rate_limits
  where minute_bucket < now() - interval '15 minutes';

  insert into private.analytics_ingest_rate_limits(request_key, minute_bucket, event_count)
  values (p_request_key, request_bucket, 1)
  on conflict (request_key, minute_bucket) do update
    set event_count = private.analytics_ingest_rate_limits.event_count + 1
  returning event_count into request_count;

  if request_count > 180 then raise exception 'Analytics rate limit reached.'; end if;

  select count(*) into session_recent_count
  from public.analytics_events as events
  where events.analytics_schema_version = 2
    and events.session_key = p_session_key
    and events.occurred_at > now() - interval '1 minute';

  if session_recent_count >= 80 then raise exception 'Analytics rate limit reached.'; end if;

  if exists (
    select 1 from public.analytics_events as events
    where events.analytics_schema_version = 2
      and events.session_key = p_session_key
      and events.event_name = cleaned_event
      and coalesce(events.tool_slug,'') = coalesce(cleaned_tool,'')
      and events.occurred_at > now() - interval '3 seconds'
  ) then
    return true;
  end if;

  insert into public.analytics_events (
    event_name, tool_slug, anonymous_session_id, occurred_at, duration_ms,
    input_size_bucket, output_size_bucket, device_class, browser_family,
    operating_system, country_code, success, error_code, failure_stage, metadata,
    region, city, visitor_key, session_key, traffic_class, traffic_class_reason,
    geo_source, geo_precision, region_code, page_path, referrer_host, landing_path,
    acquisition_source, utm_source, utm_medium, utm_campaign, analytics_schema_version
  ) values (
    cleaned_event, cleaned_tool, null, now(), bounded_duration,
    cleaned_input, cleaned_output, cleaned_device, cleaned_browser,
    cleaned_os, cleaned_country, p_success, cleaned_error, cleaned_stage, '{}'::jsonb,
    cleaned_region, cleaned_city, p_visitor_key, p_session_key, cleaned_traffic, cleaned_reason,
    cleaned_geo_source, cleaned_geo_precision, cleaned_region_code, cleaned_page_path,
    cleaned_referrer_host, cleaned_landing_path, cleaned_acquisition, cleaned_utm_source,
    cleaned_utm_medium, cleaned_utm_campaign, 2
  );

  return true;
end;
$$;

revoke all on function public.record_server_analytics_event_v2(
  text,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,text,
  text,text,text,text,text,text,text,text,text,text,text,text,text,text
) from public;
revoke all on function public.record_server_analytics_event_v2(
  text,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,text,
  text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
) from anon;
revoke all on function public.record_server_analytics_event_v2(
  text,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,text,
  text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
) from authenticated;
grant execute on function public.record_server_analytics_event_v2(
  text,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,text,
  text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
) to anon;
grant execute on function public.record_server_analytics_event_v2(
  text,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,text,
  text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
) to authenticated;

comment on function public.record_server_analytics_event_v2(
  text,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,text,
  text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
) is
  'Server-only schema-v2 analytics writer used by lumeo.in on Cloudflare. It accepts no raw IP, exact coordinates, filenames, document content, or raw cookie token.';

create or replace function public.get_admin_traffic_analytics(
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
  scope_name text := lower(trim(coalesce(p_traffic_scope,'real_audience')));
  summary jsonb;
  daily jsonb;
  full_locations jsonb;
  countries jsonb;
  regions jsonb;
  cities jsonb;
  pages jsonb;
  traffic_counts jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  admin_role := public.current_admin_role();
  if admin_role not in ('owner','admin','analyst') or not public.is_active_admin() then
    raise exception 'Active administrator access required.';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Valid analytics date range is required.';
  end if;
  if p_end_date - p_start_date > 89 then raise exception 'Analytics date range cannot exceed 90 days.'; end if;
  if scope_name not in ('real_audience','synthetic','automation','all') then raise exception 'Unsupported analytics traffic scope.'; end if;

  range_start := p_start_date::timestamp at time zone 'Asia/Kolkata';
  range_end := (p_end_date + 1)::timestamp at time zone 'Asia/Kolkata';

  with scoped as (
    select * from public.analytics_events e
    where e.analytics_schema_version = 2
      and e.occurred_at >= range_start and e.occurred_at < range_end
      and (
        scope_name='all' or e.traffic_class=scope_name
        or (scope_name='automation' and e.traffic_class in ('known_bot','suspected_automation'))
      )
  ), pv as (
    select * from scoped where event_name='page_view'
  )
  select jsonb_build_object(
    'page_views', count(*)::bigint,
    'unique_visitors', count(distinct visitor_key)::bigint,
    'sessions', count(distinct session_key)::bigint,
    'known_location_page_views', count(*) filter (
      where geo_source='cloudflare'
        and country_code is not null
        and city is not null
        and (region is not null or region_code is not null)
    )::bigint,
    'unknown_location_page_views', count(*) filter (
      where not (
        geo_source='cloudflare'
        and country_code is not null
        and city is not null
        and (region is not null or region_code is not null)
      )
    )::bigint,
    'latest_page_view_at', max(occurred_at),
    'legacy_page_views', (
      select count(*)::bigint from public.analytics_events legacy
      where legacy.analytics_schema_version=1
        and legacy.event_name='page_view'
        and legacy.occurred_at >= range_start and legacy.occurred_at < range_end
    ),
    'cutover_at', (
      select min(occurred_at) from public.analytics_events
      where analytics_schema_version=2
    )
  ) into summary from pv;

  with days as (
    select generate_series(p_start_date,p_end_date,interval '1 day')::date as metric_date
  ), scoped as (
    select e.*, (e.occurred_at at time zone 'Asia/Kolkata')::date as event_date
    from public.analytics_events e
    where e.analytics_schema_version=2
      and e.event_name='page_view'
      and e.occurred_at >= range_start and e.occurred_at < range_end
      and (
        scope_name='all' or e.traffic_class=scope_name
        or (scope_name='automation' and e.traffic_class in ('known_bot','suspected_automation'))
      )
  ), grouped as (
    select event_date,
      count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as unique_visitors,
      count(distinct session_key)::bigint as sessions,
      count(*) filter (
        where geo_source='cloudflare' and country_code is not null and city is not null
          and (region is not null or region_code is not null)
      )::bigint as known_location_page_views,
      count(*) filter (
        where not (geo_source='cloudflare' and country_code is not null and city is not null
          and (region is not null or region_code is not null))
      )::bigint as unknown_location_page_views
    from scoped group by event_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date',days.metric_date,
    'page_views',coalesce(grouped.page_views,0),
    'unique_visitors',coalesce(grouped.unique_visitors,0),
    'sessions',coalesce(grouped.sessions,0),
    'known_location_page_views',coalesce(grouped.known_location_page_views,0),
    'unknown_location_page_views',coalesce(grouped.unknown_location_page_views,0)
  ) order by days.metric_date),'[]'::jsonb)
  into daily from days left join grouped using(metric_date);

  with scoped as (
    select * from public.analytics_events e
    where e.analytics_schema_version=2 and e.event_name='page_view'
      and e.occurred_at >= range_start and e.occurred_at < range_end
      and (
        scope_name='all' or e.traffic_class=scope_name
        or (scope_name='automation' and e.traffic_class in ('known_bot','suspected_automation'))
      )
  ), grouped as (
    select city, region, region_code, country_code,
      count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors,
      count(distinct session_key)::bigint as sessions
    from scoped
    where geo_source='cloudflare' and country_code is not null and city is not null
      and (region is not null or region_code is not null)
    group by city,region,region_code,country_code
    order by page_views desc, country_code,region,city
    limit 200
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)),'[]'::jsonb) into full_locations from grouped;

  with scoped as (
    select * from public.analytics_events e
    where e.analytics_schema_version=2 and e.event_name='page_view'
      and e.occurred_at >= range_start and e.occurred_at < range_end
      and (
        scope_name='all' or e.traffic_class=scope_name
        or (scope_name='automation' and e.traffic_class in ('known_bot','suspected_automation'))
      )
  ), grouped as (
    select country_code, count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors,
      count(distinct session_key)::bigint as sessions
    from scoped where geo_source='cloudflare' and country_code is not null
    group by country_code order by page_views desc,country_code limit 100
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)),'[]'::jsonb) into countries from grouped;

  with scoped as (
    select * from public.analytics_events e
    where e.analytics_schema_version=2 and e.event_name='page_view'
      and e.occurred_at >= range_start and e.occurred_at < range_end
      and (
        scope_name='all' or e.traffic_class=scope_name
        or (scope_name='automation' and e.traffic_class in ('known_bot','suspected_automation'))
      )
  ), grouped as (
    select country_code,region,region_code,count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors,
      count(distinct session_key)::bigint as sessions
    from scoped where geo_source='cloudflare' and country_code is not null
      and (region is not null or region_code is not null)
    group by country_code,region,region_code
    order by page_views desc,country_code,region,region_code limit 200
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)),'[]'::jsonb) into regions from grouped;

  with scoped as (
    select * from public.analytics_events e
    where e.analytics_schema_version=2 and e.event_name='page_view'
      and e.occurred_at >= range_start and e.occurred_at < range_end
      and (
        scope_name='all' or e.traffic_class=scope_name
        or (scope_name='automation' and e.traffic_class in ('known_bot','suspected_automation'))
      )
  ), grouped as (
    select country_code,region,region_code,city,count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors,
      count(distinct session_key)::bigint as sessions
    from scoped where geo_source='cloudflare' and country_code is not null and city is not null
    group by country_code,region,region_code,city
    order by page_views desc,country_code,region,city limit 300
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)),'[]'::jsonb) into cities from grouped;

  with scoped as (
    select * from public.analytics_events e
    where e.analytics_schema_version=2 and e.event_name='page_view'
      and e.occurred_at >= range_start and e.occurred_at < range_end
      and (
        scope_name='all' or e.traffic_class=scope_name
        or (scope_name='automation' and e.traffic_class in ('known_bot','suspected_automation'))
      )
  ), grouped as (
    select coalesce(page_path,'Unknown page') as page_path,count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors,count(distinct session_key)::bigint as sessions
    from scoped group by coalesce(page_path,'Unknown page')
    order by page_views desc,page_path limit 100
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)),'[]'::jsonb) into pages from grouped;

  with scoped as (
    select * from public.analytics_events e
    where e.analytics_schema_version=2
      and e.occurred_at >= range_start and e.occurred_at < range_end
  ), grouped as (
    select traffic_class,
      count(*) filter(where event_name='page_view')::bigint as page_views,
      count(distinct visitor_key) filter(where event_name='page_view')::bigint as visitors,
      count(distinct session_key) filter(where event_name='page_view')::bigint as sessions
    from scoped group by traffic_class
    order by page_views desc,traffic_class
  )
  select coalesce(jsonb_agg(to_jsonb(grouped)),'[]'::jsonb) into traffic_counts from grouped;

  return jsonb_build_object(
    'schema_version',2,
    'traffic_scope',scope_name,
    'summary',summary,
    'daily',daily,
    'full_locations',full_locations,
    'countries',countries,
    'regions',regions,
    'cities',cities,
    'top_pages',pages,
    'traffic_counts',traffic_counts
  );
end;
$$;

revoke all on function public.get_admin_traffic_analytics(date,date,text) from public;
revoke all on function public.get_admin_traffic_analytics(date,date,text) from anon;
revoke all on function public.get_admin_traffic_analytics(date,date,text) from authenticated;
grant execute on function public.get_admin_traffic_analytics(date,date,text) to authenticated;

comment on function public.get_admin_traffic_analytics(date,date,text) is
  'Verified schema-v2 traffic analytics. Default scope is real audience. Full-location page views require real Cloudflare city + region + country; every incomplete/unresolved page view remains counted under unknown location so known + unknown always equals total page views.';

commit;
