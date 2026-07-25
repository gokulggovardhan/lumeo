begin;

do $$
begin
  if to_regclass('public.pdf_tools') is null then
    raise exception 'Missing required table public.pdf_tools. Run 20260712002_control_center_foundation.sql before this migration.';
  end if;
end;
$$;

-- Six live tools were shipped to production without ever getting a
-- pdf_tools row: sign, word-to-pdf, pdf-to-word, organize (Page Re-Order),
-- extract-text (PDF Text Extract), html-to-pdf. Each tool's own page calls
-- getToolBlockedState(slug), which returns "not blocked" when no matching
-- row exists -- so the public site kept working, but the admin console had
-- no row to show and zero ability to put any of these six into maintenance
-- mode or disable them. This backfills those rows so every live tool is
-- fully wired to the Control Center, matching the five tools already
-- seeded in 20260712002_control_center_foundation.sql.
--
-- slug values match the exact string each tool's page.tsx passes to
-- getToolBlockedState() -- see app/pdf/<slug>/page.tsx for merge/split/
-- compress/jpg-to-pdf/pdf-to-jpg/sign/word-to-pdf/pdf-to-word/extract-text/
-- html-to-pdf, and app/pdf/organize/page.tsx (aligned in this same change
-- from the ad hoc "organize" to "reorder", the tool's real catalog action
-- slug in lib/tools/catalog.ts -- using the same slug for both the
-- page-level maintenance check and the catalog-level live/dead toggle
-- keeps one admin row in full control of one page, instead of two
-- half-overlapping ones that could drift out of sync).
insert into public.pdf_tools (slug, category_id, name, short_description, route, icon_key, status, is_enabled, is_homepage_eligible, sort_order)
values
  ('sign', null, 'Sign PDF', 'Draw or type a signature and place it on any page.', '/pdf/sign', 'sign', 'active', true, true, 0),
  ('word-to-pdf', (select id from public.tool_categories where slug = 'convert-to-pdf'), 'Word to PDF', 'Convert Word documents to PDF using free, self-hosted LibreOffice.', '/pdf/word-to-pdf', 'convert', 'active', true, true, 0),
  ('pdf-to-word', (select id from public.tool_categories where slug = 'convert-from-pdf'), 'PDF to Word', 'Convert PDF pages into an editable Word file.', '/pdf/pdf-to-word', 'convert', 'active', true, true, 0),
  ('reorder', (select id from public.tool_categories where slug = 'organize-pdf'), 'Organize PDF', 'Reorder, rotate, duplicate, or remove pages in one document.', '/pdf/organize', 'reorder', 'active', true, true, 0),
  ('extract-text', (select id from public.tool_categories where slug = 'convert-from-pdf'), 'PDF Text Extract', 'Pull selectable text out of a PDF and read, search, or export it.', '/pdf/extract-text', 'render', 'active', true, true, 0),
  ('html-to-pdf', (select id from public.tool_categories where slug = 'convert-to-pdf'), 'HTML to PDF', 'Turn HTML and CSS into a downloadable PDF.', '/pdf/html-to-pdf', 'convert', 'active', true, true, 0)
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
