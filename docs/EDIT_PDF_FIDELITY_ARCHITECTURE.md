# Premium Edit PDF fidelity architecture

Status: fidelity program active through native detection, font identity and embedded subset glyph proof  
Historical Phase 0 audit base: `9a52ce040b5dc5a9b2d6f8d34b49039963209935`  
Current production-certified base before shaping: `3a5bcab29e4b73cf77262e5a7c4cd40d55ddeb7d`

Completed milestones:
- PR A / #402 — diagnostics + quantitative seed corpus infrastructure
- PR B / #416 — independent native detection + PDF.js reconciliation + evidence classifier
- PR C / #417 — exact PDF font resource identity + embedded-program fingerprints
- PR D / #418 — embedded TrueType subset cmap/maxp glyph proof
- Current branch — lazy HarfBuzz canonical shaping foundation

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

## Detection architecture after PR B

The Phase 0 PDF.js-first limitation is no longer current.

Native content-stream extraction and PDF.js are now independent signals:

```text
PDF bytes
  +--> native content-stream parser --> NativeContentStreamSpan[]
  |
  +--> PDF.js getTextContent() ------> DetectedTextRun[]
                         \             /
                          reconciliation
                               |
                     evidence-backed source mapping
                               |
                    Page -> Block -> Line -> Span
```

If PDF.js exposes no text, the native parser still records source text. It synthesizes a clickable run only for simple cases whose decoding, font metrics, descriptor ascent/descent and geometry are all proven. TJ-heavy, Type3, clipping, vertical, skewed, unknown-encoding and unknown-metric cases remain diagnostic/read-only instead of being guessed.

When both signals exist, exact source identity plus Unicode, baseline and writing-angle evidence can supersede a bad positional match. Existing fragmented-run provenance remains available to the stricter fragmented reconstruction guard.

## Fidelity-loss inventory from Phase 0

### Geometry / baseline

`lib/pdf/edit/textRuns.ts` uses `DEFAULT_ASCENT_RATIO = 0.85` when placing PDF.js-derived run boxes.

`lib/pdf/edit/documentModel.ts` independently uses the same `0.85` ratio to derive `baselinePt`.

That consistency makes hit testing and matching internally stable, but it does **not** make the baseline font-correct. `PdfFontRegistry` can already expose FontDescriptor ascent/descent ratios for some fonts, yet the page model does not use those metrics for its canonical baseline.

The diagnostics schema records this as unresolved rather than calling it accurate.

### Native/PDF.js reconciliation

PR B added an independent reconciliation layer that combines exact source identity where available with Unicode, baseline and writing-angle evidence. The older positional matcher remains as conservative provenance/fallback input, especially for fragmented-run reconstruction, but it is no longer the only signal.

### Font identity

PR C now retains exact PDF font-resource identity: font/descriptor/descendant/program/ToUnicode/Encoding references, Type0 CMap and writing mode, CIDSystemInfo, CIDToGIDMap identity, descriptor/descendant names, embedded-byte length and SHA-256 fingerprint. User-facing family display still falls back primarily to PDF naming evidence until deeper internal-name parsing is justified.

### Glyph coverage and shaping

PR D added bounded, read-only SFNT cmap format 4/12 plus maxp proof for embedded nonsymbolic TrueType subsets, allowing same-font edits only when the exact embedded program proves the glyph exists and PDF width evidence remains valid.

The current shaping branch introduces pinned `harfbuzzjs@1.6.2` / HarfBuzz 14.5.0 as a lazy canonical OpenType shaper for exact embedded font bytes. HarfBuzz output is not yet export geometry authority; it must first pass shaping-vs-PDF metric golden/corpus tests.

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
4. **PR D** — embedded SFNT glyph-coverage proof (completed as #418).
5. **PR E** — canonical HarfBuzz shaping foundation (current).
6. **PR F** — caret style preservation + delete/retype font regression.
7. **PR G** — PDF-space geometry/baseline fidelity and zoom-invariant round trips.
8. **PR H** — safe glyph insertion / explicit fallback architecture.
9. **PR I** — browser-local OCR fallback after native extraction exhaustion.
10. **PR J** — advanced fragmented logical ranges/caret/selection.
11. **PR K** — Structured Replace All on proven-safe matches only.
12. **PR L** — expanded corpus, visual diffs, cross-browser and exact-production certification hardening.

## Non-negotiable evidence rule

A span is not promoted to a stronger capability merely because it is visible or selectable. Missing source mapping, unknown encoding, unproven glyph coverage, unsupported rendering modes or unresolved geometry must remain capability-limited until the required evidence exists.
