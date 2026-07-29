begin;

do $$
begin
  if to_regclass('public.pdf_tools') is null then
    raise exception 'Missing required table public.pdf_tools. Run 20260712002_control_center_foundation.sql before this migration.';
  end if;
end;
$$;

-- Crop PDF is a new live tool (visual crop rectangle, flattened via
-- pdf-lib MediaBox/CropBox) inside the existing Inscribe category
-- alongside Edit PDF and Watermark PDF -- following the same precedent as
-- 20260727001_seed_watermark_tool.sql, category_id is left null rather
-- than inventing a new category row out of scope for this change.
insert into public.pdf_tools (slug, category_id, name, short_description, route, icon_key, status, is_enabled, is_homepage_eligible, sort_order)
values
  ('crop', null, 'Crop PDF', 'Crop PDF pages to a custom rectangle.', '/pdf/crop', 'crop', 'active', true, true, 1)
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
