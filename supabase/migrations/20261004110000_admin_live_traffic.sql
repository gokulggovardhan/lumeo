-- Near-real-time Admin analytics for verified traffic only.
-- "Live" is server-polled and privacy-preserving: no raw IP, cookies,
-- visitor/session keys, user agents, coordinates, or document content leave
-- the database. Page-view "hits" remain distinct from technical requests.

create or replace function public.get_admin_live_analytics_v2(
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
  as_of timestamptz := now();
  summary jsonb;
  minute_buckets jsonb;
  recent_hits jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  admin_role := public.current_admin_role();
  if admin_role not in ('owner', 'admin', 'analyst')
     or not public.is_active_admin() then
    raise exception 'Active administrator access required.';
  end if;

  if scope_name not in ('real_audience', 'synthetic', 'automation', 'all') then
    raise exception 'Unsupported analytics traffic scope.';
  end if;

  with scoped as materialized (
    select e.*
    from public.analytics_events e
    where e.analytics_schema_version = 2
      and e.occurred_at >= as_of - interval '30 minutes'
      and (
        scope_name = 'all'
        or e.traffic_class = scope_name
        or (
          scope_name = 'automation'
          and e.traffic_class in ('known_bot', 'suspected_automation')
        )
      )
  ),
  page_views as (
    select *
    from scoped
    where event_name = 'page_view'
  )
  select jsonb_build_object(
    'page_views_last_minute',
      count(*) filter (where occurred_at >= as_of - interval '1 minute'),
    'page_views_last_five_minutes',
      count(*) filter (where occurred_at >= as_of - interval '5 minutes'),
    'active_visitors_last_five_minutes',
      count(distinct visitor_key) filter (
        where occurred_at >= as_of - interval '5 minutes'
      ),
    'active_sessions_last_five_minutes',
      count(distinct session_key) filter (
        where occurred_at >= as_of - interval '5 minutes'
      ),
    'known_location_page_views_last_five_minutes',
      count(*) filter (
        where occurred_at >= as_of - interval '5 minutes'
          and geo_source = 'cloudflare'
          and country_code is not null
          and city is not null
          and (region is not null or region_code is not null)
      ),
    'unknown_location_page_views_last_five_minutes',
      count(*) filter (
        where occurred_at >= as_of - interval '5 minutes'
          and not (
            geo_source = 'cloudflare'
            and country_code is not null
            and city is not null
            and (region is not null or region_code is not null)
          )
      ),
    'last_page_view_at', max(occurred_at)
  )
  into summary
  from page_views;

  with scoped_page_views as materialized (
    select e.*
    from public.analytics_events e
    where e.analytics_schema_version = 2
      and e.event_name = 'page_view'
      and e.occurred_at >= date_trunc('minute', as_of) - interval '9 minutes'
      and (
        scope_name = 'all'
        or e.traffic_class = scope_name
        or (
          scope_name = 'automation'
          and e.traffic_class in ('known_bot', 'suspected_automation')
        )
      )
  ),
  buckets as (
    select generate_series(
      date_trunc('minute', as_of) - interval '9 minutes',
      date_trunc('minute', as_of),
      interval '1 minute'
    ) as bucket_start
  ),
  grouped as (
    select
      date_trunc('minute', occurred_at) as bucket_start,
      count(*)::bigint as page_views,
      count(distinct visitor_key)::bigint as visitors
    from scoped_page_views
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'minute', buckets.bucket_start,
        'page_views', coalesce(grouped.page_views, 0),
        'visitors', coalesce(grouped.visitors, 0)
      )
      order by buckets.bucket_start
    ),
    '[]'::jsonb
  )
  into minute_buckets
  from buckets
  left join grouped using (bucket_start);

  with recent as (
    select
      e.occurred_at,
      e.page_path,
      e.tool_slug,
      e.city,
      e.region,
      e.region_code,
      e.country_code
    from public.analytics_events e
    where e.analytics_schema_version = 2
      and e.event_name = 'page_view'
      and e.occurred_at >= as_of - interval '30 minutes'
      and (
        scope_name = 'all'
        or e.traffic_class = scope_name
        or (
          scope_name = 'automation'
          and e.traffic_class in ('known_bot', 'suspected_automation')
        )
      )
    order by e.occurred_at desc
    limit 20
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'occurred_at', occurred_at,
        'page_path', page_path,
        'tool_slug', tool_slug,
        'city', city,
        'region', region,
        'region_code', region_code,
        'country_code', country_code
      )
      order by occurred_at desc
    ),
    '[]'::jsonb
  )
  into recent_hits
  from recent;

  return jsonb_build_object(
    'schema_version', 2,
    'traffic_scope', scope_name,
    'as_of', as_of,
    'summary', summary,
    'minute_buckets', minute_buckets,
    'recent_hits', recent_hits
  );
end;
$$;

revoke all on function public.get_admin_live_analytics_v2(text) from public;
revoke all on function public.get_admin_live_analytics_v2(text) from anon;
grant execute on function public.get_admin_live_analytics_v2(text) to authenticated;

comment on function public.get_admin_live_analytics_v2(text) is
  'Returns privacy-preserving near-real-time verified Admin analytics. Active visitors/sessions mean distinct identifiers with a page view in the last five minutes. Recent hits expose no raw identity, IP, cookie, user agent, coordinates, or document data.';
