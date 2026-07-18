begin;

do $$
begin
  if to_regclass('public.pdf_tools') is null then
    raise exception 'Missing required table public.pdf_tools. Run 20260712_002_control_center_foundation.sql before this migration.';
  end if;
end;
$$;

-- PDF to JPG now has a real browser-first engine (pdfjs-dist rasterization
-- + client-side JPEG/ZIP export). Flip it from coming_soon to active so it
-- becomes clickable on the public catalog and homepage grid.

update public.pdf_tools
set status = 'active'
where slug = 'pdf-to-jpg';

commit;
