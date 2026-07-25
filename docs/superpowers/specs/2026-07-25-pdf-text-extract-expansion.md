# Design: PDF Text Extract — rename + feature expansion

Date: 2026-07-25
Status: Approved

## Context

Follow-up workstream from the earlier "premium home screen" request:
rename "Extract text" to "PDF Text Extract" and add selective page-range
extraction, TXT/JSON/CSV output formats, and confirm the existing
preview/copy pane already covers that part of the ask (it does — per-page
collapsible panels with per-page copy already ship).

Current tool (`components/pdf/ExtractTextTool.tsx`) already: uploads one
PDF, extracts every page's text via PDF.js, shows collapsible per-page
panels, filters by a search box, copies per-page or all, downloads `.txt`.

## Scope

1. **Rename**: display label only, not the route/slug (`extract-text`
   stays the URL and analytics `toolSlug` — renaming a stable identifier
   would break existing links/analytics continuity for no benefit).
   Changes: `lib/tools/catalog.ts` action label, `PdfToolRegistry.tsx`
   title/shortTitle/bullets, `app/pdf/extract-text/page.tsx` H1 and SEO
   metadata. The home-screen tile and nav dropdown pick this up
   automatically (single source: the catalog label), including its new
   A-Z position — no separate edit needed there.
2. **Selective page-range extraction**: a text input (e.g. `1-3, 7`)
   that filters which pages are included in the preview list, copy-all,
   and download — search and range compose (both narrow the same
   underlying page set). Empty input = all pages, matching today's
   behavior exactly.
3. **Output format options**: a format selector (TXT / JSON / CSV)
   controlling the Download button's output. JSON is
   `[{ "page": 1, "text": "..." }, ...]`. CSV is `page,text` with proper
   quoting/escaping for embedded commas, quotes, and newlines. Copy-all
   stays plain text (clipboard content is inherently text; a
   structured-format clipboard copy isn't a meaningful use case here).
4. **Preview pane**: already shipped (per-page collapsible panels,
   per-page copy) — no changes needed, confirmed against the original
   ask.

## Implementation

- `lib/pdf/textExtraction.ts`: add `PageTextEntry` type
  (`{ page: number; text: string }`), `parsePageRange(input, totalPages)`
  (returns matched page numbers or a specific error for a bad range
  token), `selectPageEntries(pageTexts, pages)` (applies an optional page
  filter, attaching each entry's real 1-based page number so labels stay
  correct after filtering), `buildTxtFromEntries`, `buildJsonFromEntries`,
  `buildCsvFromEntries`. Removes the now-superseded `buildTxtFile`
  (`selectPageEntries(pageTexts, null)` + `buildTxtFromEntries` covers
  the unfiltered case identically — no behavior change, just expressed
  through the new entry-based functions so range-filtering and format
  selection share one code path instead of forking).
- `components/pdf/ExtractTextTool.tsx`: add page-range input and format
  select to the settings panel; compute the active entry set from
  `pageTexts` + range + search (search continues to filter which panels
  are *displayed*; range additionally filters which pages are eligible
  for copy-all/download — the two together cover "show me pages 1-3 that
  mention X" naturally, since a page must pass both to appear). Wire
  Download to build the selected format from the range-filtered entries;
  Copy all uses `buildTxtFromEntries` on the same set.
- `lib/tools/catalog.ts`, `components/pdf/PdfToolRegistry.tsx`,
  `app/pdf/extract-text/page.tsx`: label/title/H1/SEO text updated to
  "PDF Text Extract"; bullets updated to mention page-range selection and
  TXT/JSON/CSV export.

## Testing

- `tests/text-extraction.test.ts`: replace the removed `buildTxtFile`
  coverage with tests for `parsePageRange` (valid ranges, single pages,
  mixed lists, out-of-bounds clamping, invalid tokens), `selectPageEntries`
  (no filter, a filter, a filter matching nothing), and each
  `build*FromEntries` function (correct page numbers post-filter, CSV
  escaping for a value containing a comma/quote/newline).
- Manual verification in a running dev server: upload a multi-page PDF,
  set a page range, confirm only those pages preview/download; switch
  format and confirm JSON/CSV output shape; confirm search + range
  compose correctly; confirm the unfiltered case still matches prior
  `.txt` output exactly.
- `npm run build` / `npm run lint` as the standing bar.

## Out of scope

- "PDF Page Re-Order" rename/polish and the admin console wiring audit
  (separate workstreams, not started).
- Any change to how text is extracted from the PDF itself (still
  PDF.js `getTextContent()` + `joinTextItems`, unchanged).
- OCR / scanned-document text recognition (a different, already-tracked
  "Recognize" catalog group, not this tool).
