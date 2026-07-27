# Edit PDF tool — design

## Context

Lumeo's catalog has an `Inscribe` category ("Edit & annotate") that's been `coming_soon` since the static catalog was written, listing placeholder actions (Add text, Images, Shapes, Highlight, Watermark, Page numbers, Header & footer, Crop, Bookmarks) with zero live implementation. This spec covers building one real tool, **Edit PDF**, that delivers the core of that category: click-to-place text boxes, freehand ink, shapes (including a highlight preset), and whiteout/redaction boxes, all flattened into an exported PDF.

Signatures and page management (rotate/reorder/delete/duplicate) are explicitly out of scope — they already exist as their own tools (Sign PDF, Page Re-Order) and duplicating them here would fragment functionality across two places for no benefit. Watermarking also stays out of scope — it already has its own reserved slot in the Secure category's roadmap.

## Prior art this design builds on

`components/pdf/SignPdfTool.tsx` already proves the exact architecture this tool needs, for one element type (a signature image):
- Renders the current PDF page via `pdfjs-dist` to a `<canvas>`.
- Overlays an absolutely-positioned HTML layer where the signature image is placed, dragged, and resized.
- On save, loads the *original* file bytes fresh with `pdf-lib` (`PDFDocument.load`), embeds the image (`embedPng`), and calls `page.drawImage(...)` at the stored coordinates to flatten it in, then downloads.

`components/pdf/sign/SignatureCreator.tsx`'s `DrawTab` proves the freehand-ink-on-canvas mechanism (pointer-event stroke capture, redraw loop, export to PNG data URL via `canvas.toDataURL`).

Edit PDF generalizes both patterns to four element types instead of one.

## Scope (v1)

**In scope:**
- Element types: text boxes, freehand ink, shapes (rectangle, ellipse, line, highlight — a semi-transparent rectangle preset), whiteout/redaction boxes.
- Select / move / resize / delete any placed element before export (ink: move + delete only, no resize).
- Multi-page navigation (prev/next, page counter) to place elements on any page of the document.
- Undo/redo across all element operations.
- Zoom controls (+/−/fit-width).
- Export via `pdf-lib`, flattening every element into the final PDF.

**Explicitly out of scope (v1):**
- Signatures (use Sign PDF).
- Page management — rotate, reorder, delete, duplicate, insert blank pages, merge, split (use Page Re-Order / Merge / Split).
- Watermarking (reserved for its own future tool in the Secure category).
- Multi-select of elements.
- True redaction (stripping underlying text/image data — see "Redaction semantics" below).
- Vector-path ink (canvas-to-PNG only, see "Ink rendering" below).

## Architecture

**Rendering:** `pdfjs-dist` renders the active page to a `<canvas>` (visual only, unchanged from every other tool). A transparent, absolutely-positioned HTML `<div>` overlay sits on top of that canvas, holding one real DOM node per placed element:
- Shapes and whiteout boxes: styled `<div>`s (border/background/opacity via CSS).
- Text boxes: a `<textarea>` (or contentEditable div) for direct in-place typing.
- Ink: drawn on a temporary capture `<canvas>` while the pointer is down; on pointer-up, the finished stroke is rasterized to a PNG data URL and represented from then on as an `<img>` element positioned like everything else.

Rejected alternative: rendering every element type on one imperative canvas (matching literal "canvas overlay" language some specs used). Text input requires a real DOM element regardless of approach, so an all-canvas design ends up hybrid anyway — with the added cost of manual hit-testing math for selection/resize that the DOM approach gets for free from the browser. The DOM-overlay approach is what `SignPdfTool` already uses successfully; generalizing it is strictly less work and lower risk than building a second rendering system.

**Coordinate model:** every element's position/size is stored in PDF point space (the page's own coordinate system), not screen pixels. Screen-pixel positions are derived from PDF-space coordinates at render time using the current zoom level; the reverse conversion (screen → PDF space) happens once, at the moment a pointer event creates or moves an element. Storing in PDF space means the export step needs no re-derivation of screen-to-PDF math, and elements don't drift if the container resizes or the user changes zoom mid-edit.

## Element interaction model

- A tool palette (Select / Text / Draw / Shapes / Whiteout) sets the active tool.
- With a placement tool active, clicking the canvas places a new element of that type at the click point (ink instead begins stroke capture on pointer-down, ends on pointer-up).
- With the Select tool active (or after finishing a placement), clicking an existing element selects it, showing a bounding box with drag handles:
  - **Move:** drag the element body.
  - **Resize:** drag a corner handle (text boxes, rectangles/ellipses/whiteout boxes) or drag either endpoint (line shapes). Not available for ink.
  - **Delete:** Delete/Backspace key, or a toolbar button, while selected.
  - **Text edit:** a text box is directly editable in place (starts in edit mode on creation); a property panel alongside shows font size, color, bold/italic.
- One element selected at a time. No multi-select in v1.

## Redaction semantics

"Whiteout" in this tool is **visual-only**: it draws an opaque rectangle over the content in the exported PDF. It does **not** remove or alter the underlying text/image data in the PDF's content stream — `pdf-lib` has no text-removal API, and true redaction would require rasterizing the entire affected page to a flat image (losing text-selectability and searchability for that whole page, not just the redacted region), which is a real, deliberate feature this version doesn't include.

The UI must state this plainly wherever the whiteout tool is introduced (tool tooltip and/or a one-line note in the tool's own panel), along the lines of: *"Whiteout hides content visually in the exported PDF. For documents with legal or compliance requirements, verify the underlying content is also removed before sharing."* This is a correctness/trust requirement, not a nice-to-have — shipping a tool called "redaction" without this caveat would be actively misleading.

## Data model & undo/redo

```ts
type EditElementBase = { id: string; page: number; x: number; y: number; width: number; height: number };

type EditElement =
  | (EditElementBase & { type: "text"; text: string; fontSize: number; color: string; bold: boolean; italic: boolean })
  | (EditElementBase & { type: "shape"; shapeKind: "rect" | "ellipse" | "line" | "highlight"; color: string; opacity: number })
  | (EditElementBase & { type: "whiteout"; color: "white" | "black" })
  | (EditElementBase & { type: "ink"; pngDataUrl: string });
```

All elements across all pages live in one flat array in component state. Every element is plain, serializable data — no canvas pixels in the state itself (ink's rasterized PNG is stored as a data URL string, which is serializable) — so undo/redo is implemented as an array of full-array snapshots, pushed on every committed change (add, move, resize, delete, text-edit-blur). Ctrl+Z / Ctrl+Y plus toolbar buttons trigger it. This mirrors the low-risk, already-proven approach to state history used elsewhere in this codebase; no custom diffing or command-pattern undo system is needed at this scale (dozens of elements per document, not thousands).

## Export & error handling

On save: load the *original* uploaded file's bytes fresh with `PDFDocument.load` (never mutate the pdf.js-rendered copy — matching `SignPdfTool`'s existing approach), then for each page, iterate its elements in the array and call the matching `pdf-lib` draw operation (`drawText`, `drawRectangle`, `drawEllipse`, `drawLine`, `drawImage` for ink/any future embedded images) at the element's stored PDF-space coordinates. Save and trigger a download.

Error handling reuses established patterns already in this codebase rather than inventing new ones:
- `checkPdfFileSize` / `hasPdfMagicBytes` / `isPdfNamedFile` on upload (same as every other tool).
- The password/encryption detection heuristic already used in `ExtractTextTool` (regex on the thrown error's message).
- A `runWithTimeout`-style guard around the export step (matching `HtmlToPdfTool`'s `GENERATE_TIMEOUT_MS` pattern), so a pathological PDF can't hang the save button forever.
- Per-page try/catch during export, consistent with the per-page isolation added to `ExtractTextTool` this session — one page's draw failure shouldn't lose the whole export; the affected page is skipped with a visible warning rather than silently corrupting output or crashing entirely.

## UI layout & app integration

Page structure matches every other tool page exactly: `PublicCatalogPageShell` → `L2ToolPageHeader` → tool workspace → `L2PrivacyNote`, with the same `getToolBlockedState("edit")` maintenance-check pattern.

- **Workspace top bar:** page counter + prev/next, zoom controls (+/−/fit-width), Undo/Redo, Download.
- **Center:** the pdfjs canvas + overlay described above.
- **Right sidebar:** tool palette tabs (Select / Text / Draw / Shapes / Whiteout), each showing its own property controls when active (color, font size, stroke width, etc.) — the same per-panel-settings idea already used in `HtmlToPdfTool`.

**Catalog & admin wiring** (matching the pattern established for the 6 previously-unwired tools this session):
- New action in `lib/tools/catalog.ts` under `Inscribe`: `{ label: "Edit PDF", slug: "edit", route: "/pdf/edit", live: true }`. This flips `Inscribe.availability` from `"soon"` to `"available"` — its first live action.
- A `pdf_tools` DB row via a new migration (matching `20260725001_seed_missing_pdf_tools.sql`'s shape).
- An entry in `components/pdf/PdfToolRegistry.tsx` (title, description, bullets — same shape as the other 11).
- FAQ copy added to `components/pdf/toolFaqs.ts` as `editPdfFaqs`, rendered on `/guides` only (no visible FAQ on the tool page itself, per this session's established rule) — plus a `FaqGroup` entry and a `ToolGuide` card there.
- `SoftwareApplication` + `BreadcrumbList` JSON-LD on the tool's own page, matching the other 11 tools' pattern exactly (`lib/public-site/schema.ts` builders, no new schema infrastructure needed).
- Standard SEO metadata (`withSeoOverride`) matching every other tool page's shape.

## Out-of-scope follow-ups (explicitly deferred, not forgotten)

- True redaction (content-stripping, not just visual whiteout).
- Vector-path ink instead of rasterized PNG strokes.
- Multi-select / multi-element operations.
- Watermarking (separate future tool).
- Signature placement inside this tool (use Sign PDF).
- Page management inside this tool (use Page Re-Order).
