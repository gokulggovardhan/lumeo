begin;

do $$
begin
  if to_regclass('public.pdf_tools') is null then
    raise exception 'Missing required table public.pdf_tools. Run 20260712_002_control_center_foundation.sql before this migration.';
  end if;

  if to_regclass('public.homepage_tool_slots') is null then
    raise exception 'Missing required table public.homepage_tool_slots. Run 20260712_002_control_center_foundation.sql before this migration.';
  end if;
end;
$$;

-- Widen both public RPCs to also surface 'coming_soon' tools. Previously
-- both filtered to status in ('active', 'beta') only, so any tool an
-- admin marked 'coming_soon' (e.g. JPG to PDF, PDF to JPG) silently
-- vanished from the public catalog and the homepage slot grid, even
-- though it was correctly seeded and assigned. 'hidden' and
-- 'maintenance' remain excluded intentionally.

create or replace function public.get_public_pdf_catalog()
returns table (
  tool_slug text,
  tool_name text,
  short_description text,
  route text,
  icon_key text,
  status text,
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
    categories.slug as category_slug,
    categories.name as category_name,
    categories.description as category_description,
    coalesce(categories.sort_order, 9999) as category_sort_order,
    tools.sort_order as tool_sort_order
  from public.pdf_tools as tools
  left join public.tool_categories as categories
    on categories.id = tools.category_id
  where tools.is_enabled = true
    and tools.status in ('active', 'beta', 'coming_soon')
    and (categories.id is null or categories.is_active = true)
  order by
    coalesce(categories.sort_order, 9999),
    tools.sort_order,
    tools.name;
$$;

comment on function public.get_public_pdf_catalog() is
  'Returns safe public PDF tool catalog fields. RPC is used instead of direct public table SELECT so administrative fields, UUIDs, timestamps, settings, audit data, and analytics remain private.';

create or replace function public.get_public_homepage_tools()
returns table (
  slot_number smallint,
  tool_slug text,
  tool_name text,
  short_description text,
  route text,
  icon_key text,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    slots.slot_number,
    tools.slug as tool_slug,
    tools.name as tool_name,
    tools.short_description,
    tools.route,
    tools.icon_key,
    tools.status
  from public.homepage_tool_slots as slots
  join public.pdf_tools as tools
    on tools.id = slots.tool_id
  where slots.slot_number between 1 and 5
    and tools.is_enabled = true
    and tools.is_homepage_eligible = true
    and tools.status in ('active', 'beta', 'coming_soon')
  order by slots.slot_number;
$$;

comment on function public.get_public_homepage_tools() is
  'Returns only safe public homepage tool slot fields for slots 1 through 5, including coming_soon tools (rendered as non-clickable on the public homepage). The permanent All PDF Tools card is not stored in homepage_tool_slots.';

revoke all on function public.get_public_pdf_catalog() from public;
revoke all on function public.get_public_homepage_tools() from public;

grant execute on function public.get_public_pdf_catalog() to anon;
grant execute on function public.get_public_pdf_catalog() to authenticated;
grant execute on function public.get_public_homepage_tools() to anon;
grant execute on function public.get_public_homepage_tools() to authenticated;

commit;
