begin;

do $$
begin
  if to_regclass('public.pdf_tools') is null then
    raise exception 'Missing required table public.pdf_tools. Run 20260712002_control_center_foundation.sql before this migration.';
  end if;
end;
$$;

-- Edit PDF is a new live tool (text/draw/shapes/whiteout, flattened via
-- pdf-lib) with no existing tool_categories row for its Inscribe category --
-- following the same precedent as the "sign" row seeded in
-- 20260725001_seed_missing_pdf_tools.sql, category_id is left null rather
-- than inventing a new category row out of scope for this change.
insert into public.pdf_tools (slug, category_id, name, short_description, route, icon_key, status, is_enabled, is_homepage_eligible, sort_order)
values
  ('edit', null, 'Edit PDF', 'Add text, freehand drawing, shapes, and whiteout boxes to a PDF.', '/pdf/edit', 'edit', 'active', true, true, 0)
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
