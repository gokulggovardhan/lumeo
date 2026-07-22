begin;

do $$
begin
  if to_regclass('public.pdf_tools') is null then
    raise exception 'Missing required table public.pdf_tools. Run 20260712002_control_center_foundation.sql before this migration.';
  end if;
end;
$$;

-- JPG to PDF now has a real browser-first engine (pdf-lib embedJpg/embedPng).
-- Flip it from coming_soon to active so it becomes clickable on the public
-- catalog and homepage grid. PDF to JPG remains coming_soon until its own
-- engine ships.

update public.pdf_tools
set status = 'active'
where slug = 'jpg-to-pdf';

commit;
