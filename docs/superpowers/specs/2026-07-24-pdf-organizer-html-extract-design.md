# Design: Page Organizer, HTML to PDF, Text Extractor

Date: 2026-07-24
Status: Approved (pending implementation plan)

## Context

`lib/tools/catalog.ts` already reserves catalog slugs for these three tools but
has no live page behind them:

- Compose group: `reorder`, `rotate`, `remove-pages`, `extract-pages`,
  `duplicate-page` — currently `live: true` but placeholder-routed to
  `/pdf/split`.
- Render group: `extract-text` — `live: false`, no route.
- Convert group: `html-to-pdf` — `live: false`, no route.

Merge, Split, Compress, JPG↔PDF, Sign, Word↔PDF are already live and are
**out of scope** — no rebuild.

## Scope

Three new tools, each a fully client-side, browser-only feature:

1. Page Organizer / Rotator — `/pdf/organize`
2. HTML to PDF — `/pdf/html-to-pdf`
3. Text Extractor & Viewer — `/pdf/extract-text`

## Architecture

All three follow the existing tool-page pattern used by the 7 live tools:

- `app/pdf/<slug>/page.tsx` — server component, SEO metadata via
  `withSeoOverride()` / `L2ToolPageHeader`, `next/dynamic` import of the
  client tool component with `ToolWorkspaceLoading` as loading fallback.
- Client tool component in `components/pdf/<Name>Tool.tsx`, built from the
  shared `L2*` primitives in `components/pdf/workspace/ToolWorkspace.tsx`
  (`L2ToolWorkspace`, `L2ToolMainColumn`, `L2ToolSettingsPanel`,
  `L2UploadStage`, `L2FileList`/`L2FileCard`, `L2ActionArea`,
  `L2ResultState`, `L2PrivacyNote`) and `components/ui/Aura.tsx` primitives.
- File validation via `lib/pdf/uploadValidation.ts`
  (`isPdfNamedFile`/`hasPdfMagicBytes`/`checkPdfFileSize`), naming via
  `lib/pdf/sanitizeFileName.ts`, size display via `lib/pdf/formatBytes.ts`.
- PDF rendering/parsing via the shared `lib/pdf/pdfjs.ts` singleton
  (`openPdfJsDocument`, `renderPageWithTimeout`, `PAGE_RENDER_TIMEOUT_MS`) —
  never a second worker instance.
- Document mutation via `pdf-lib`.
- Every async operation wrapped in `try/catch` with a specific, actionable
  error message (matching the render-timeout precedent in `pdfjs.ts`).
- `URL.revokeObjectURL()` called once a generated download's object URL is no
  longer needed (on unmount or replacement).
- No network calls anywhere in these three tools — 100% browser-only,
  matching `processing: "browser"` already declared for their catalog groups.

## Catalog & navigation wiring

- `lib/tools/catalog.ts`: point `reorder`/`rotate`/`remove-pages`/
  `extract-pages`/`duplicate-page` at `route: "/pdf/organize"`. Flip
  `extract-text` and `html-to-pdf` to `live: true` with routes `/pdf/extract-text`
  and `/pdf/html-to-pdf`.
- `components/pdf/PdfToolRegistry.tsx`: add `organize`, `extract-text`,
  `html-to-pdf` entries to `pdfTools` / `PdfToolSlug` so the in-tool
  `PdfToolSwitcher` dropdown includes them.
- No changes to `PublicPdfChrome.tsx` nav structure beyond what the catalog
  already drives.

## 1. Page Organizer / Rotator (`/pdf/organize`)

**Input:** one PDF file (matches Split's single-document model).

**Flow:**
1. Upload via `L2UploadStage` (accept `application/pdf,.pdf`, `multiple={false}`).
2. `openPdfJsDocument()` opens the file; render one thumbnail canvas per page
   (capped render scale for thumbnail size, using `renderPageWithTimeout`).
   Thumbnails render progressively (not blocking on the full set) so a
   200-page document doesn't freeze the tab.
3. Each thumbnail is a draggable card (native HTML5 Drag and Drop API — no
   new dependency, consistent with Split's existing reorder implementation)
   showing page number, current rotation indicator, and a selection
   checkbox for bulk actions.
4. Per-page controls: rotate 90° CW/CCW (accumulates through
   `normalizeRotation()`), delete, duplicate.
5. Bulk toolbar (visible once ≥1 page selected): rotate selected, delete
   selected.
6. Reordering updates an in-memory page-order array; no re-render of
   thumbnails needed (CSS order/transform), keeping drag interaction smooth
   even on large documents.
7. Export: build output via `pdf-lib` — `PDFDocument.copyPages()` in the
   final order, `setRotation()` per page from the tracked rotation map,
   skip deleted pages, `save()`.
8. Result via `L2ResultState` with page-count/size summary and download
   action; `URL.revokeObjectURL()` on the previous blob URL if the user
   re-runs before downloading.

**Edge cases:** empty PDF, single-page PDF (disable reorder, allow
rotate/nothing-to-delete guard so the export can never reach zero pages),
encrypted PDF (surface `pdf-lib`'s decrypt error as a clear message),
corrupted structure (catch at `openPdfJsDocument` and at `PDFDocument.load`,
distinct messages for each stage).

## 2. HTML to PDF (`/pdf/html-to-pdf`)

**Input:** HTML/CSS typed or pasted directly (no file upload — this tool
generates a PDF from markup, it doesn't parse an existing one).

**Flow:**
1. Left pane: plain `<textarea>`-based code editor for HTML (with an
   embedded `<style>` block supported inline — no separate CSS pane, one
   input surface keeps the tool simple per YAGNI).
2. Right pane: sandboxed `<iframe srcDoc={...}>` live preview, debounced
   re-render on keystroke (~300ms) so typing stays smooth.
3. Settings panel (`L2ToolSettingsPanel`): page size (A4/Letter/Legal),
   orientation (portrait/landscape), margin (none/normal/wide).
4. A small set of starter templates (e.g. "Blank", "Invoice", "Letter") that
   populate the editor on click — convenience, not a requirement to use one.
5. Generate: `html2pdf.js` runs against the iframe's live DOM (not a second
   parse of the string) with the chosen page/margin options, output
   triggers direct browser download.
6. Same `try/catch` + timeout guard pattern as page rendering elsewhere:
   `html2pdf.js` generation wrapped with a bounded wait and a clear timeout
   error for pathological CSS (e.g. huge box-shadow blur causing
   html2canvas slowdown).

**Edge cases:** empty editor (disable Generate), external image URLs in the
markup (allowed — `html2pdf.js`/html2canvas will attempt to load them; no
crawling or fetching happens outside the user's own iframe), oversized
content producing a multi-page PDF automatically (`html2pdf.js` default
pagination behavior).

## 3. Text Extractor & Viewer (`/pdf/extract-text`)

**Input:** one PDF file.

**Flow:**
1. Upload via `L2UploadStage` (single file).
2. `openPdfJsDocument()` opens the file; for each page call
   `page.getTextContent()` and join text items in reading order (left-to-right,
   top-to-bottom per PDF.js's default item order), yielding to the event
   loop between pages (`requestAnimationFrame`/microtask batching) so
   extraction of a long document doesn't block the UI.
3. Main column: per-page collapsible text panels (`L2AdvancedDisclosure`
   per page or a simple scrollable list — reuse whichever reads cleaner;
   default to page-1 expanded, rest collapsed for long documents).
4. Search box filters/highlights matches across all pages.
5. Per-page "Copy" button and a top-level "Copy all" / "Download .txt"
   action (`L2ActionArea`).

**Edge cases:** scanned/image-only PDF with no text layer (detect empty
`getTextContent()` output across all pages, show a clear notice: "No
selectable text found — this looks like a scanned document" rather than an
empty successful result), encrypted PDF, corrupted PDF — same two-stage
catch as Organizer.

## Dependencies

- `html2pdf.js` — installed (`npm install html2pdf.js`).
- No other new dependencies; reorder/drag uses native HTML5 DnD, no
  `dnd-kit`/`sortablejs` needed.

## Testing

- Manual verification in browser (dev server) for each tool: golden path
  (small valid PDF / simple HTML) and at least one edge case per tool
  (encrypted PDF, scanned PDF, oversized HTML).
- TypeScript compilation check (`tsc --noEmit` or project's existing check
  command) after each tool lands, matching the pattern from the last admin
  console session.

## Out of scope

- Rebuilding Merge/Split/Compress (already live).
- OCR (`Recognize` group — separate "soon" catalog group, not touched).
- Server-side rendering/rasterization for HTML to PDF (stays 100% client).
- Rich-text (WYSIWYG) editor for HTML to PDF — raw code editor only.
