# Crop PDF — Engineering Specification (pre-development, for review)

Status: **SPEC ONLY — no production code written.** Catalog already has a
stub entry (`lib/tools/catalog.ts`: `{ label: "Crop", slug: "crop", live: false }`)
so this fills that in, it does not create a new catalog surface.

Route: `/pdf/crop` (new `app/pdf/crop/page.tsx`, following the exact
pattern of `app/pdf/watermark/page.tsx` / `app/pdf/organize/page.tsx`:
`generateMetadata` via `withSeoOverride`, `getToolBlockedState("crop")`
gate, JSON-LD via `buildSoftwareApplicationSchema`/`buildBreadcrumbSchema`,
`dynamic(() => import(...))` for the tool component).

---

## 1. Problem statement

User uploads a PDF, selects a rectangular crop region (per page or per a
selected group of pages), and exports a new PDF where every affected
page's visible content is cropped to that rectangle. Everything happens
client-side — no upload to a server, matching every other Lumeo PDF tool.

## 2. UX

### 2.1 Flow
1. Upload (reuse `L2UploadStage`, `isPdfNamedFile`/`checkPdfFileSize`/
   `hasPdfMagicBytes`/`checkPdfPageCount` from `lib/pdf/uploadValidation.ts`
   — identical validation chain to Watermark/Edit/Organize).
2. Preview current page rendered via `openPdfJsDocument` (same as
   Watermark/Edit), with a **single draggable, resizable crop rectangle**
   overlaid — not five preset corners like Watermark, since crop has no
   natural "corner" semantic; the rectangle itself is the whole
   interaction surface.
3. Aspect-ratio presets as a settings-panel row (not required to hold the
   architecture together, but expected UX for a crop tool): Free, 1:1,
   4:3, 16:9, A4, Letter, "match first page." Selecting a preset
   recomputes the rectangle's height (or width) around its current
   center, doesn't move the anchor corner.
4. Page-scope selector — same three-way pattern the app already
   standardized in Watermark (`WatermarkPageRange`): **All pages** (crop
   rect uses whichever page is on-screen when applied, converted per-page
   the same way Watermark's corner anchor is, see §5), **This page only**,
   **Custom range**. No "odd/even" here — no realistic use case for
   crop.
5. "Apply Crop" (mirrors Watermark's "Add Watermark") runs
   `exportCroppedPdf`, producing a real pdf-lib–saved PDF via
   `page.setMediaBox`/`setCropBox` (see §4), same download/blob lifecycle
   as Watermark: `URL.createObjectURL`, revoke-on-config-change effect,
   revoke-before-next-export.
6. Undo/redo via `useHistoryState` (same hook Watermark and Edit already
   use for undo/redo across all interactions).

### 2.2 What's explicitly NOT in v1 scope (mirrors Watermark's documented
out-of-scope list in its own header comment)
- Per-page independent crop rectangles in one session (v1: one rectangle,
  applied uniformly across the selected page scope — matches how
  Watermark's single-placement mode applies one config across a page
  range, not a different one per page).
- Non-rectangular (freeform/polygon) crop.
- Crop-then-uncrop (non-destructive edit history beyond in-session
  undo/redo) — export is destructive, same as every other Lumeo PDF
  tool; users keep their original file if they want it back.

## 3. Browser-first architecture

Identical layering to Watermark PDF, because Watermark PDF is the proven
reference architecture for this exact class of tool ("percent-overlay +
pdfjs preview + pdf-lib export"):

```
components/pdf/CropPdfTool.tsx          <- top-level state owner (mirrors WatermarkTool.tsx)
components/pdf/crop/CropRectView.tsx     <- draggable/resizable overlay (mirrors WatermarkPreview.tsx + EditElementView.tsx's resize math)
lib/pdf/crop/config.ts                  <- pure config + geometry (mirrors lib/pdf/watermark/config.ts)
lib/pdf/crop/export.ts                  <- pdf-lib export pipeline (mirrors lib/pdf/watermark/export.ts)
app/pdf/crop/page.tsx                   <- route shell (mirrors app/pdf/watermark/page.tsx)
```

`config.ts` stays self-contained (no `@/` path-alias imports) so it loads
directly under `node --experimental-strip-types` for tests — same
constraint documented at the top of `lib/pdf/watermark/config.ts` and
`lib/pdf/pageOrganizer.ts`. `export.ts` duplicates the tiny bit of
`pageCoordinates.ts` it needs verbatim, for the same reason
`lib/pdf/watermark/export.ts` already does (see that file's own header
comment) — **do not "fix" this duplication by importing across the
Node/bundler boundary; it will break the test runner.**

### 3.1 Data model (draft, for review — not final until implementation)

```ts
// lib/pdf/crop/config.ts
export type CropRect = {
  // Percent of the VISUAL (rotation-aware) page, 0-100, top-left origin —
  // identical convention to Watermark's xPct/yPct and Edit PDF's element
  // model. Values are the rect's own box, not a top-left anchor + separate
  // external width/height source (crop's box IS the whole config, unlike
  // Watermark where width/height are derived from font metrics/image size).
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
};

export type CropScope =
  | { mode: "all" }
  | { mode: "current"; pageIndex: number }
  | { mode: "custom"; pages: number[] }; // zero-based, same convention as WatermarkPageRange's "custom"

export type CropConfig = {
  rect: CropRect;
  scope: CropScope;
  aspectPreset: "free" | "1:1" | "4:3" | "16:9" | "a4" | "letter" | "match-first-page";
};
```

### 3.2 Reusable utilities identified (already exist, use as-is)

| Utility | File | Reused for |
|---|---|---|
| `openPdfJsDocument`, `withPageTimeout`, `renderPageWithTimeout` | `lib/pdf/pdfjs.ts` | preview rendering |
| `isPdfNamedFile`, `checkPdfFileSize`, `hasPdfMagicBytes`, `checkPdfPageCount` | `lib/pdf/uploadValidation.ts` | upload validation |
| `copyArrayBuffer`, `toArrayBuffer` | `lib/pdf/arrayBuffer.ts` | never mutate the pdfjs-rendered copy, same pattern as Watermark/Edit |
| `sanitizeFileStem` | `lib/pdf/sanitizeFileName.ts` | output filename |
| `formatBytes` | `lib/pdf/formatBytes.ts` | file-size display |
| `useHistoryState` | `lib/sign/useHistoryState.ts` | undo/redo |
| `normalizePageRotation`, `visualPageSize`, `toNativePoint`, **`toNativeBox`**, `composeRotationDegrees` | `lib/pdf/pageCoordinates.ts` | **`toNativeBox` is exactly the crop-rectangle transform** — converts a visual-space axis-aligned box straight to a native-space (MediaBox-relative) box for any of the 4 legal page rotations. This is the single most important discovery for this spec: crop needs no new coordinate math, `toNativeBox` already does the whole job. |
| `L2ToolWorkspace`, `L2ToolMainColumn`, `L2ToolSettingsPanel`, `L2UploadStage`, `L2FileCard`, `L2ActionArea`, `ToolWorkspaceLoading` | `components/pdf/workspace/ToolWorkspace.tsx` | shell UI, identical to Watermark |
| `getToolBlockedState` | `lib/tools/tool-status.ts` | maintenance-mode gate |
| `withSeoOverride`, `buildSoftwareApplicationSchema`, `buildBreadcrumbSchema` | `lib/public-site/seo.ts`, `lib/public-site/schema.ts` | route metadata/JSON-LD |
| 2D resize pointer math (both width and height from a corner handle) | `components/pdf/edit/EditElementView.tsx` (`handleResizeStart`/`handleResizeMove`, lines ~123-160) | the crop rectangle needs 2D resize, which Watermark never needed (its anchor has no independent size) — Edit PDF's shape-resize logic is the closest existing prior art and should be adapted, not reinvented |

### 3.3 Reusable PDF transformation pipeline

`page.setMediaBox(x, y, width, height)` (pdf-lib) is the actual crop
operation — it does not delete content, it changes the page's visible
boundary, which is the correct, standard, non-destructive-to-content way
every PDF crop tool works (content outside the new MediaBox is simply not
rendered, and PDF viewers respect this). `page.setCropBox(...)` should
also be set to the same rectangle for viewers that respect CropBox over
MediaBox (not all do — setting both is the compatible answer, same
"don't trust one PDF box in isolation" lesson already baked into
`pageCoordinates.ts`'s header comment about MediaBox vs viewport
disagreeing under rotation).

Pipeline shape (mirrors `exportWatermarkedPdf`'s structure exactly):

```ts
// lib/pdf/crop/export.ts (draft signature, for review)
export async function exportCroppedPdf(
  originalBytes: ArrayBuffer,
  config: CropConfig,
): Promise<{ bytes: Uint8Array; skippedPages: number[] }>
```

For each page in the resolved scope: read `nativeWidth/nativeHeight` and
`rotation` (same as Watermark's loop), compute the visual box from
`config.rect` (percent → points using `visualPageSize`), convert to
native via `toNativeBox`, call `setMediaBox`/`setCropBox`, wrap in the
same per-page `try/catch → skippedPages.push(pageIndex)` pattern Watermark
uses so one bad page never fails the whole export.

## 4. Shared components identified from Watermark PDF

- `WatermarkTool.tsx`'s overall component shape (upload state, page-nav
  state, `pdfJsDocRef`, blob-lifecycle effects, stale-download-reset
  effect keyed on config) is the direct template for `CropPdfTool.tsx`.
  **Do not copy-paste it** — extract the truly-shared parts (upload
  handling, page-nav, blob lifecycle, stale-download-reset) into a shared
  hook if and when a third tool needs the same shape, per the "don't
  duplicate, don't premature-abstract" rule; for a second occurrence,
  copying the pattern once more is still acceptable and matches how
  Watermark itself was built by adapting Edit PDF's pattern rather than
  factoring out a hook after only one prior example.
- `WatermarkPreview.tsx`'s pointer-capture drag pattern (`setPointerCapture`/
  live-DOM-write-during-gesture/commit-once-at-`pointerup`) is reused for
  moving the crop rect's body; `EditElementView.tsx`'s resize-handle
  pattern is reused for resizing it. `CropRectView.tsx` is a genuine new
  component (needs move + 2D resize; Watermark's anchor only ever needed
  move), but built from two already-proven patterns, not new pointer math.
- The stale-download-reset `useEffect(() => {...}, [config])` pattern
  from `WatermarkTool.tsx` (revoke blob + reset to "Apply Crop" label on
  any config change) is copied verbatim in spirit.

## 5. Corner-placement lesson applied (the actual v1.0.0 fix)

Watermark PDF v1.0.0's core bug was: a page-local geometric value (a
corner-safe anchor) computed once against one page's dimensions, then
reused unchanged across every page. Crop PDF has the exact same hazard
in `CropScope: "all"` mode on a document mixing page sizes/orientations —
a rectangle expressed as *points* on page 1 does not mean the same thing
as *points* on a differently-sized page 2. **This spec avoids that bug by
construction**: `CropRect` is defined in **percent of each page's own
visual dimensions**, not absolute points, and the percent→native
conversion (`toNativeBox`) happens **fresh, per page, inside the export
loop** — never precomputed once and passed through. This is the same
"page-local, not document-level" principle the Watermark v1.0.0 fix
established, applied from the start rather than discovered as a bug
after the fact.

One nuance beyond Watermark's fix: a percent-based rectangle can still
produce visually different aspect ratios across differently-sized/
oriented pages if the user picked "All pages" with a document mixing
portrait and landscape — this is a real, known limitation to document
(not hide) in the UI: "All pages" applies the same relative rectangle
per page, which may not look identical in absolute proportions on a
landscape page inserted among portrait ones. Surface this as inline copy
near the scope selector, don't silently produce a surprising result.

## 6. Test strategy

Mirrors Watermark's two-test-file split exactly:

- `tests/crop-config.test.ts` — pure functions only (`config.ts`), run
  under `node --experimental-strip-types --test`. Cover: percent↔native
  round-trip at all 4 rotations (reuse the exact test pattern already
  proven in `tests/watermark-config.test.ts` for `cornerAnchorPct` — sweep
  every rotation × several rect sizes and assert the box lands where
  expected via independent recomputation, not by asserting against the
  same formula being tested); aspect-preset recompute keeps the fixed
  corner fixed; scope resolution (all/current/custom) against various
  page counts including out-of-range custom pages (silently filtered,
  matching `resolvePageIndices`'s existing, tested behavior).
- `tests/crop-export.test.ts` — real `exportCroppedPdf` calls against
  real pdf-lib–built fixture PDFs, decoding the **real** saved
  MediaBox/CropBox values (not trusting the function's own math — read
  `page.getMediaBox()` back from the reloaded, saved PDF, the same
  "trust the actual bytes, not the formula" discipline
  `tests/watermark-export.test.ts` already established for `Tm`/`cm`
  operators). Explicit regression test: mixed-page-size document
  (Letter portrait + Letter landscape + A4), `scope: "all"`, assert each
  page's own resulting MediaBox is proportionally correct for *that*
  page's own original dimensions — this is the direct analog of the
  Watermark v1.0.0 regression test and should exist from day one, not be
  added after a bug report.
- Live-browser verification before any release: real upload, real drag/
  resize, real export, real decode of the downloaded PDF's MediaBox —
  same discipline used throughout Watermark's release process (never
  trust the on-screen preview alone).

## 7. Accessibility requirements

- Crop rectangle must be operable via keyboard, not just pointer drag —
  this is a **new** requirement Watermark didn't fully need (its corner
  presets are keyboard-operable buttons; only its *manual drag* is
  pointer-only, an accepted, documented gap for a supplementary
  interaction). Crop's rectangle is the *primary* interaction, so
  keyboard-only crop must work: arrow keys nudge position by a fixed
  step (1% or similar) when the rect (or a resize handle) has focus,
  Shift+Arrow resizes. This needs its own `tabIndex`/`role="slider"`-style
  treatment (or four explicit numeric inputs for x/y/width/height as a
  fully keyboard-native alternative input, shown in the settings panel
  regardless of drag state — recommended as the primary accessible path
  rather than trying to make free-drag itself fully keyboard-equivalent).
- Aspect-ratio preset buttons: same pattern as Watermark's corner buttons
  (`aria-label`, `tabIndex=0`) — and this time, **do** add
  `aria-pressed` reflecting the active preset from day one (Watermark's
  corner buttons shipped v1.0.0 without this; don't repeat the gap in a
  new tool when it's known and cheap to include from the start).
- Live region (`aria-live="polite"`) announcing the current rect as
  "Crop area: 20% from left, 15% from top, 60% wide, 70% tall" (or
  page-relative absolute units if that reads better) whenever it changes
  via keyboard — screen-reader users need equivalent feedback to what a
  sighted user sees as the rectangle visually resizing.
- Numeric x/y/width/height inputs (if included per above) are real
  labeled `<input type="number">` elements — automatically accessible,
  matches the existing pattern already used for Watermark's font-size
  input.

## 8. Performance targets

Same targets as Watermark PDF (already met and verified in production):
export of a typical (<50 page) document completes in ≤1-2s; no blob
accumulation across repeated exports (verified via instrumented
`createObjectURL`/`revokeObjectURL` counts, same method used for
Watermark's production audit); no unnecessary re-decoding of the source
PDF bytes per interaction (drag/resize must only touch the CSS-positioned
overlay div, matching Watermark's "commit once at gesture end, live DOM
write during the gesture" rule — never call `setConfig` on every
`pointermove`, only on `pointerup`, exactly as `WatermarkPreview.tsx`
already does). No new performance requirement beyond what Watermark
already satisfies; this is a rectangle-math problem, cheaper than
Watermark's font-metric/image-decode work.

## 9. Edge cases

- Crop rectangle degenerates to zero width/height (dragged to a point) —
  reject before export, same class of validation as Watermark's empty-text
  short-circuit in `exportWatermarkedPdf` (`if (!content.text.trim())
  return early` equivalent: if `widthPct <= 0 || heightPct <= 0`, disable
  "Apply Crop" and show inline validation, don't silently export a
  degenerate MediaBox).
- Crop rectangle extends outside \[0,100\]% — clamp during drag (same
  `Math.min`/`Math.max` clamping pattern `WatermarkPreview.tsx`'s
  `handlePointerMove` already uses for its anchor).
- Mixed page sizes/orientations with `scope: "all"` — covered in §5;
  must have an explicit regression test from day one, not discovered as
  a production bug like Watermark's did.
- Page already has a non-default `/Rotate` — `toNativeBox` already
  handles this (it's literally what it was built for), but needs the
  same "verify against a real exported PDF's actual MediaBox, not just
  the formula" test discipline Watermark eventually had to apply
  retroactively.
- Document at the `MAX_PDF_PAGE_COUNT` cap (500 pages, per
  `lib/pdf/uploadValidation.ts`) with `scope: "all"` — export must
  process all 500 pages without a UI hang; if this proves slow in
  practice, consider a progress indicator (Watermark doesn't have one
  because its typical exports are sub-second; crop across 500 pages
  might warrant one — flag for measurement during implementation, not
  pre-optimize now).
- Encrypted/password-protected PDF upload — same handling Watermark
  already has (`uploadError.message` matched against `/password|encrypt/i`
  in `WatermarkTool.tsx`'s `addFile` catch block) should be copied as-is.

## 10. Implementation roadmap

1. `lib/pdf/crop/config.ts` + `tests/crop-config.test.ts` (pure logic
   first, TDD, no UI yet — matches how Watermark's `cornerAnchorPct` was
   built and proven before any component code).
2. `lib/pdf/crop/export.ts` + `tests/crop-export.test.ts`, including the
   mixed-page-size regression test from §6 written *before* any UI exists.
3. `components/pdf/crop/CropRectView.tsx` (move + resize overlay), unit-
   verified in isolation (Storybook-less manual harness or a temporary
   test route, matching however Watermark's preview component was
   hand-verified) before wiring into the full tool.
4. `components/pdf/CropPdfTool.tsx` (state owner, wires config.ts +
   export.ts + CropRectView.tsx + ToolWorkspace shell primitives).
5. `app/pdf/crop/page.tsx` route + catalog flip (`lib/tools/catalog.ts`:
   `crop.live` → `true`) + Supabase `pdf_tools` row seed migration
   (mirrors `supabase/migrations/20260727001_seed_watermark_tool.sql`).
6. Accessibility pass per §7 (keyboard nudge, numeric inputs, live
   region, `aria-pressed` on presets) — built in from step 3, not
   retrofitted.
7. Full manual + automated verification pass (lint/test/typecheck/build,
   then real-browser upload/drag/resize/export/decode, matching the
   exact verification discipline this document's Watermark PDF v1.0.0
   release used) before flipping `live: true` in production.
8. Freeze, tag `crop-pdf-v1.0.0`, same closing ritual as Watermark.

Estimated complexity: **smaller than Watermark PDF** — no font metrics,
no image embedding, no tiling, no rotation-of-content-independent-of-page
concept (crop has no rotation of its own; it only inherits the page's
existing rotation via `toNativeBox`, which already exists and is already
tested indirectly through Watermark/Edit's own test suites). The main new
work is the resizable-rectangle UI and its keyboard accessibility, not
the PDF math.
