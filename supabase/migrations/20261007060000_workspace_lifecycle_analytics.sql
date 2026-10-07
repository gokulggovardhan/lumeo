begin;

-- Step 10: extend the existing verified, server-ingested analytics vocabulary
-- with privacy-safe Workspace lifecycle events. The browser still sends no
-- filenames, document IDs, exact file sizes, document contents, raw IPs, or
-- full user agents. Existing Cloudflare-side traffic classification, HMAC
-- identities, approximate geography and ingest-secret verification remain
-- unchanged.
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
    'download_started',
    'workspace_started',
    'workspace_tool_switched',
    'workspace_finish_opened',
    'workspace_completed'
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

  if cleaned_event not in (
    'page_view',
    'download_started',
    'workspace_started',
    'workspace_finish_opened',
    'workspace_completed'
  ) and cleaned_tool is null then
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

  -- Do not time-window-dedupe stored events here. A genuine rapid reload is a
  -- legitimate new page view. Duplicate SPA initialization is prevented in
  -- AnalyticsPageView, and the browser client does not retry failed POSTs.

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

comment on function public.record_server_analytics_event(
  text, text, text, text, text, text, text, integer, text, text, text, text,
  text, boolean, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text
) is
  'Verified Cloudflare analytics writer for public tool and privacy-safe Workspace lifecycle events. Raw IPs, filenames, document IDs, exact sizes and document contents are never accepted.';

commit;
