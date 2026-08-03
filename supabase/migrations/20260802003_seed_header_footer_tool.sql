begin;

do $$
begin
  if to_regclass('public.pdf_tools') is null then
    raise exception 'Missing required table public.pdf_tools. Run 20260712002_control_center_foundation.sql before this migration.';
  end if;
end;
$$;

-- Header & Footer is a new live tool (per-page header/footer text stamping
-- via pdf-lib, sharing the lib/pdf/core/* layout engine with Watermark PDF
-- and Page Numbers) inside the existing Inscribe category alongside Edit
-- PDF, Watermark PDF, Crop PDF, and Page Numbers -- following the same
-- precedent as 20260802002_seed_page_numbers_tool.sql, category_id is left
-- null rather than inventing a new category row out of scope for this
-- change (Inscribe grouping is handled by lib/tools/catalog.ts, not this
-- column).
insert into public.pdf_tools (slug, category_id, name, short_description, route, icon_key, status, is_enabled, is_homepage_eligible, sort_order)
values
  ('header-footer', null, 'Header & Footer', 'Add a header and footer to a PDF.', '/pdf/header-footer', 'header-footer', 'active', true, true, 3)
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
