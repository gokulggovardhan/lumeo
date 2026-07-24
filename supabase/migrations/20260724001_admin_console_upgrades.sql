begin;

do $$
begin
  if to_regclass('public.pdf_tools') is null then
    raise exception 'Missing required table public.pdf_tools. Run 20260712002_control_center_foundation.sql first.';
  end if;

  if to_regclass('public.analytics_events') is null then
    raise exception 'Missing required table public.analytics_events. Run 20260712004_privacy_analytics.sql first.';
  end if;
end;
$$;

-- Per-tool maintenance message, shown on the tool's own page when an admin
-- takes it down for maintenance/upgrade work. Distinct from site_settings'
-- maintenance_mode (that one is all-or-nothing across the whole site).
alter table public.pdf_tools
  add column if not exists maintenance_message text;

-- Bug fix, both toggles: get_public_pdf_catalog previously filtered to
-- is_enabled = true and status in ('active', 'beta', 'coming_soon'), so a
-- tool an admin disabled OR set to 'hidden'/'maintenance' vanished from this
-- RPC's result set entirely. Downstream, resolveLumeoTools()
-- (lib/tools/resolve.ts) looks up each static action by slug in that result
-- set -- when the slug is missing, it silently fell back to the static
-- catalog's live:true default instead of treating it as not-live. Net
-- effect: disabling a tool or marking it hidden/maintenance in the admin
-- console did NOT actually take it down anywhere it mattered (homepage
-- tiles, nav menu, /pdf-tools listing all kept treating it as live). Now
-- returns every row regardless of status or enabled state, plus is_enabled
-- itself, so resolveLumeoTools can compute `live` correctly from both
-- fields -- the only filtering left here is category visibility.
--
-- CREATE OR REPLACE cannot change a table-returning function's OUT parameter
-- list (column set) -- Postgres requires an explicit drop first when the
-- return shape changes, or the whole migration aborts with SQLSTATE 42P13.
drop function if exists public.get_public_pdf_catalog();

create function public.get_public_pdf_catalog()
returns table (
  tool_slug text,
  tool_name text,
  short_description text,
  route text,
  icon_key text,
  status text,
  is_enabled boolean,
  maintenance_message text,
  category_slug text,
  category_name text,
  category_description text,
  category_sort_order integer,
  tool_sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tools.slug as tool_slug,
    tools.name as tool_name,
    tools.short_description,
    tools.route,
    tools.icon_key,
    tools.status,
    tools.is_enabled,
    tools.maintenance_message,
    categories.slug as category_slug,
    categories.name as category_name,
    categories.description as category_description,
    coalesce(categories.sort_order, 9999) as category_sort_order,
    tools.sort_order as tool_sort_order
  from public.pdf_tools as tools
  left join public.tool_categories as categories
    on categories.id = tools.category_id
  where categories.id is null or categories.is_active = true
  order by
    coalesce(categories.sort_order, 9999),
    tools.sort_order,
    tools.name;
$$;

comment on function public.get_public_pdf_catalog() is
  'Returns safe public PDF tool catalog fields across every status and enabled state (active/beta/coming_soon/hidden/maintenance, enabled or not) so callers can compute per-action live state and surface maintenance messaging. RPC is used instead of direct public table SELECT so administrative fields, UUIDs, timestamps, settings, audit data, and analytics remain private.';

revoke all on function public.get_public_pdf_catalog() from public;
grant execute on function public.get_public_pdf_catalog() to anon;
grant execute on function public.get_public_pdf_catalog() to authenticated;

-- Per-event location feed for the admin console: "for each and every click,
-- where is it from" -- a raw recent-events list (capped, most recent first)
-- alongside the existing aggregate location_summary. Never exposes the
-- anonymous session id, an IP address, or precise coordinates -- same privacy
-- scope as every other analytics surface in this codebase.
create or replace function public.get_admin_recent_analytics_events(
  p_limit integer default 50
)
returns table (
  occurred_at timestamptz,
  event_name text,
  tool_slug text,
  device_class text,
  browser_family text,
  operating_system text,
  city text,
  region text,
  country_code text,
  success boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  admin_role text;
  bounded_limit integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  admin_role := public.current_admin_role();
  if admin_role not in ('owner', 'admin', 'analyst') or not public.is_active_admin() then
    raise exception 'Active administrator access required.';
  end if;

  bounded_limit := greatest(1, least(coalesce(p_limit, 50), 200));

  return query
    select
      events.occurred_at,
      events.event_name,
      events.tool_slug,
      events.device_class,
      events.browser_family,
      events.operating_system,
      events.city,
      events.region,
      events.country_code,
      events.success
    from public.analytics_events as events
    order by events.occurred_at desc
    limit bounded_limit;
end;
$$;

comment on function public.get_admin_recent_analytics_events(integer) is
  'Returns the most recent public analytics events (capped at 200) for active owners, admins, and analysts, including approximate city/region/country per event. Never exposes anonymous session ids, IP addresses, or precise coordinates.';

revoke all on function public.get_admin_recent_analytics_events(integer) from public;
revoke all on function public.get_admin_recent_analytics_events(integer) from anon;
revoke all on function public.get_admin_recent_analytics_events(integer) from authenticated;
grant execute on function public.get_admin_recent_analytics_events(integer) to authenticated;

commit;
