-- Align the live Word → PDF catalog copy with the browser-side conversion
-- architecture shipped in September 2026. Do not rewrite the historical seed
-- migration; this forward-only correction keeps applied migration history intact.

update public.pdf_tools
set
  short_description = 'Convert Word documents to PDF locally in your browser.',
  updated_at = now()
where slug = 'word-to-pdf'
  and short_description is distinct from 'Convert Word documents to PDF locally in your browser.';
