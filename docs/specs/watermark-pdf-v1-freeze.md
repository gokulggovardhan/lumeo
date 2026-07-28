# Watermark PDF — v1.0.0 freeze

Status: **FROZEN**. Tag: `watermark-pdf-v1.0.0` (commit `d8b825e`, `main`).

Watermark PDF (`/pdf/watermark`) is production-stable. Do not modify unless one of:

- a real production bug is found,
- a security issue,
- a performance regression,
- an accessibility regression,
- or an explicit v1.1 enhancement request.

## What shipped in v1.0.0

Text and image (PNG/JPG) watermarks; single or tiled placement; five corner
presets (top-left/top-right/bottom-left/bottom-right/center) plus manual
drag; opacity, scale, rotation, margin; page ranges (all/first/odd/even/
custom).

## Known, accepted limitations (not bugs, do not "fix" without a v1.1 request)

- No `aria-pressed`/active-state indicator on the five corner-placement
  buttons (`components/pdf/WatermarkTool.tsx`). Real WCAG 4.1.2 gap,
  low severity, deliberately left as-is pending a dedicated a11y pass
  across all PDF tools rather than a one-off fix here.
- Manual (dragged) placement stores one `{ xPct, yPct }` pair applied
  verbatim to every page in the export range — correct, intentional
  behavior (matches Edit PDF's existing percent-of-page element model),
  not a defect. Only *corner* placement is page-local
  (`lib/pdf/watermark/config.ts`'s `WatermarkSinglePlacement`).
- Browser matrix beyond the Chromium engine used for automated
  verification (Firefox, Safari, Edge, iOS Safari, Android Chrome) has
  not been independently verified as of this freeze.

## Where the architecture lives (for the next engineer)

- `lib/pdf/watermark/config.ts` — pure config/geometry math, loadable by
  both the Node test runner and Next's bundler (see the file's own header
  comment for why `cornerAnchorPct` is duplicated verbatim into
  `export.ts` rather than imported).
- `lib/pdf/watermark/export.ts` — pdf-lib export pipeline; per-page
  corner-anchor derivation is the core fix from the v1.0.0 release
  (see commit `d8b825e`) and the reason corner placement is safe on
  documents with mixed page sizes/orientations.
- `components/pdf/watermark/WatermarkPreview.tsx` — on-screen preview;
  derives the same anchor the export pipeline will, for whichever page
  is currently displayed.
- `lib/pdf/pageCoordinates.ts` — the canonical, independently-tested
  rotation-aware coordinate transform, shared with Edit PDF. Watermark's
  `export.ts` keeps its own verbatim copy for the Node-test-runner
  loading constraint described in that file's header — **read that
  comment before "deduplicating" it**, the duplication is intentional.
