begin;

do $$
begin
  if to_regclass('public.pdf_tools') is null then
    raise exception 'Missing required table public.pdf_tools. Run 20260712002_control_center_foundation.sql before this migration.';
  end if;
end;
$$;

-- Page Numbers is a new live tool (rotation-aware page-number stamping via
-- pdf-lib, sharing the lib/pdf/core/* layout engine with Watermark PDF)
-- inside the existing Inscribe category alongside Edit PDF, Watermark PDF,
-- and Crop PDF -- following the same precedent as
-- 20260729001_seed_crop_pdf_tool.sql, category_id is left null rather than
-- inventing a new category row out of scope for this change (Inscribe
-- grouping is handled by lib/tools/catalog.ts, not this column).
insert into public.pdf_tools (slug, category_id, name, short_description, route, icon_key, status, is_enabled, is_homepage_eligible, sort_order)
values
  ('page-numbers', null, 'Page Numbers', 'Add page numbers to a PDF.', '/pdf/page-numbers', 'page-numbers', 'active', true, true, 2)
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
