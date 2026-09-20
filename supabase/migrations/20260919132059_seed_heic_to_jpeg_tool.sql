begin;

do $$
begin
  if to_regclass('public.pdf_tools') is null then
    raise exception 'Missing required table public.pdf_tools. Run 20260712002_control_center_foundation.sql before this migration.';
  end if;
end;
$$;

-- Register the browser-first HEIC workspace with the existing canonical
-- tool-slug gate used by public analytics and the Control Center. Existing
-- categories are PDF-specific, so this image converter remains uncategorized.
insert into public.pdf_tools (slug, category_id, name, short_description, route, icon_key, status, is_enabled, is_homepage_eligible, sort_order)
values
  ('heic-to-jpeg', null, 'HEIC to JPEG', 'Convert iPhone HEIC photos to high-quality JPEG in your browser.', '/heic-to-jpeg', 'convert', 'active', true, true, 0)
on conflict (slug) do update
set category_id = excluded.category_id,
    name = excluded.name,
    short_description = excluded.short_description,
    route = excluded.route,
    icon_key = excluded.icon_key,
    status = excluded.status,
    is_enabled = excluded.is_enabled,
    is_homepage_eligible = excluded.is_homepage_eligible,
    updated_at = now();

commit;
