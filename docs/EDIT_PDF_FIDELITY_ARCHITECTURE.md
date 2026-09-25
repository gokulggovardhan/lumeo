# Premium Edit PDF fidelity architecture

Status: Phase 0 audit + PR A diagnostics/measurement foundation  
Phase 0 audit base: `9a52ce040b5dc5a9b2d6f8d34b49039963209935`  
PR A refreshed integration base: `f8a14ea6c190c3939a805549cab160e7c874352c`

## Product invariant

Normal Edit PDF work remains browser-first and local-first. PDF bytes, extracted text, embedded font bytes, OCR images and OCR text are not inputs to a Lumeo server-side editing pipeline.

The existing native content-stream mutation/export engine remains the write authority. This program adds better evidence, reconstruction, font intelligence, shaping and geometry around that engine; it does not replace proven native rewriting with a generic overlay editor.

## Current architecture map

```text
PDF bytes
  |
  +--> pdf.js (pdfjs-dist)
  |      +--> page raster preview
  |      +--> getTextContent()
  |             |
  |             +--> textRunsFromContent()
  |                    +--> PDF.js-derived visible run string
  |                    +--> percent bounds
  |                    +--> approximate top/baseline placement
  |
  +--> pdf-lib document/object graph
         |
         +--> page /Resources + /Contents
         +--> Form XObject traversal
         |      +--> inherited/local resources
         |      +--> q/Q, cm and graphics paint state
         |
         +--> contentStream tokenizer/walker
         |      +--> BT/ET
         |      +--> Tf/Tm/Td/TD/T*
         |      +--> Tj/TJ/'/"
         |      +--> Tc/Tw/Tz/TL/Ts/Tr
         |      +--> q/Q/cm/gs + native paint state
         |
         +--> matchTextRun
         |      +--> PDF.js visible run <-> native operator
         |      +--> currently position-first matching
         |
         +--> PdfFontRegistry
         |      +--> PDF font resource
         |      +--> font encoding resolution
         |      +--> PDF widths / CID widths / standard AFM
         |      +--> embedded FontFile/FontFile2/FontFile3 extraction
         |      +--> best-effort exact FontFace preview for browser-loadable programs
         |
         +--> fragmentedRun reconstruction
         |
         +--> Page -> Block -> Line -> Span document model
         |      +--> capability
         |      +--> source provenance
         |      +--> style / paint / geometry
         |
         +--> EditPdfTool semantic edit session
         |      +--> inline preview/input
         |      +--> layout guard
         |      +--> native text/style/paint operation
         |      +--> Undo/Redo
         |
         +--> applyEditPlan
                +--> exact target stream resolution
                +--> Tj/TJ/'/" rewrite
                +--> local text-state / paint overrides and restoration
                +--> Form isolation when required
                +--> exported PDF bytes
```

## Important audit finding: detection is currently PDF.js-first

The custom content-stream walker already understands native PDF text operators and Form XObjects, but the Edit PDF UI does not currently use it as an independent source of visible text.

The current page path is:

```text
pdf.js getTextContent()
  -> DetectedTextRun[]
  -> native operator matching
  -> font resolution
  -> page text model
```

If PDF.js yields no usable text items, the UI currently has no run to match, even when native text-show operators may exist in the content stream. The native parser therefore acts primarily as a validation/rewrite locator after PDF.js discovery rather than as a first-class detector.

This is a major target for PR B: native extraction and PDF.js must become independent signals that are reconciled, not a single PDF.js-led chain.

## Fidelity-loss inventory from Phase 0

### Geometry / baseline

`lib/pdf/edit/textRuns.ts` uses `DEFAULT_ASCENT_RATIO = 0.85` when placing PDF.js-derived run boxes.

`lib/pdf/edit/documentModel.ts` independently uses the same `0.85` ratio to derive `baselinePt`.

That consistency makes hit testing and matching internally stable, but it does **not** make the baseline font-correct. `PdfFontRegistry` can already expose FontDescriptor ascent/descent ratios for some fonts, yet the page model does not use those metrics for its canonical baseline.

The diagnostics schema records this as unresolved rather than calling it accurate.

### Native/PDF.js reconciliation

`matchTextRun.ts` currently matches principally by position using a fixed tolerance. It does not yet combine Unicode, baseline, direction, font identity, source order and geometry into a confidence model.

### Font identity

`PdfFontRegistry` currently derives its display family primarily from `/BaseFont`, stripping a subset prefix and common style suffixes. It does not yet parse the embedded font program's name table/PostScript identity.

### Glyph coverage and shaping

The current encoding layer is intentionally conservative and does not parse TrueType/OpenType/CFF glyph programs or perform OpenType shaping. Complex-script shaping, ligatures, GPOS/GSUB and exact glyph-cluster mapping are not yet canonical export inputs.

### TJ-heavy replacement

The proven writer preserves surrounding position with advance compensation, but a rewritten TJ run is collapsed into replacement text plus compensation rather than preserving original kerning numbers that were specific to the old glyph sequence. A future shaping/geometry layer must provide deterministic replacement advances instead of treating old TJ adjustments as reusable.

### Inline preview versus export

The inline editor is an HTML input. It can use exact embedded browser-loadable font bytes through FontFace, but browser layout remains a preview. Export geometry is driven by PDF font metrics and text state. The program must strengthen the canonical metric/shaping model rather than make DOM measurement authoritative.

### Delete/retype continuity

Selection currently owns the source style. There is no standalone persistent `CaretTextStyleSnapshot` that survives a source span becoming empty/disappearing after a committed deletion. PR F will address this after font/resource foundations are stronger.

### Capability classification

The current model distinguishes native-editable / fragmented-editable / view-only / unsupported at span level and native-editable / mixed / view-only / no-detected-text at page level. It does not yet evidence-classify scanned, hybrid, Type3, Form XObject, vertical, encoding-limited, font-limited, clipping and other requested document/page classes.

## PR A: diagnostics and measurement foundation

PR A deliberately changes no production edit behavior and adds no third-party dependency.

It adds:

- a local diagnostic report schema for current page/spans;
- raw encoded text bytes where available;
- native decoding status;
- PDF.js-visible text evidence;
- font identity/encoding/embedded-preview evidence;
- text state and native paint evidence;
- width/advance comparison where current metrics can prove it;
- explicit `unresolvedEvidence` entries for information not yet exposed by the current parser;
- a local-only JSON download helper;
- a quantitative corpus measurement schema;
- a generated privacy-safe seed report in CI.

Unknown measurements are represented as `null`, never as a fabricated pass.

## Current PDF/font dependencies

| Package | Locked version | Role | License |
| --- | --- | --- | --- |
| `pdfjs-dist` | 6.3.289 | browser rendering and current visible text extraction | Apache-2.0 |
| `pdf-lib` | 1.17.1 | PDF object/resource access and document write/materialization | MIT |
| `@pdf-lib/standard-fonts` | 1.0.0 | Standard-14 encoding/AFM support | MIT |

No HarfBuzz, fontkit, opentype.js or OCR engine is introduced by PR A.

Candidate font/OCR dependencies will be evaluated in a later dependency-gate PR for maintenance status, browser/WASM behavior, bundle cost, security and license before installation. AGPL/GPL PDF engines are out of scope without an explicit legal decision.

## Planned controlled sequence

1. **PR A** — diagnostics + corpus/measurement infrastructure.
2. **PR B** — independent native detection + PDF.js reconciliation + evidence-based classifier.
3. **PR C** — structured font resource resolver + embedded-font registry/fingerprints.
4. **PR D** — professional font parsing/metrics foundation after dependency decision.
5. **PR E** — canonical shaping integration where justified.
6. **PR F** — caret style preservation + delete/retype font regression.
7. **PR G** — PDF-space geometry/baseline fidelity and zoom-invariant round trips.
8. **PR H** — safe glyph insertion / explicit fallback architecture.
9. **PR I** — browser-local OCR fallback after native extraction exhaustion.
10. **PR J** — advanced fragmented logical ranges/caret/selection.
11. **PR K** — Structured Replace All on proven-safe matches only.
12. **PR L** — expanded corpus, visual diffs, cross-browser and exact-production certification hardening.

## Non-negotiable evidence rule

A span is not promoted to a stronger capability merely because it is visible or selectable. Missing source mapping, unknown encoding, unproven glyph coverage, unsupported rendering modes or unresolved geometry must remain capability-limited until the required evidence exists.
