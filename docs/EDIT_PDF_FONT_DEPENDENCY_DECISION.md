# Edit PDF font, shaping, and OCR dependency decision

Date: 2026-09-26
Baseline: protected main `3a5bcab29e4b73cf77262e5a7c4cd40d55ddeb7d`

## Decision

Lumeo will use a deliberately split architecture:

- **@cantoo/fontkit 2.0.12** — font-program inspection, internal naming, metrics, glyph coverage, CFF/TrueType/OpenType parsing, and future deterministic subsetting.
- **harfbuzzjs 1.6.2** — reserved for the later canonical shaping layer (glyph clusters, GSUB/GPOS, complex scripts, advances and offsets).
- **opentype.js 2.0.0** — not adopted because its parser/metrics/layout surface materially overlaps fontkit and would create a second font-program stack.
- **tesseract.js 7.0.0** — deferred until the OCR milestone. It will be loaded only for scanned/image-only regions and run locally in a worker.
- **MuPDF.js / Scribe.js** — not adopted. No AGPL/GPL PDF/OCR engine is introduced by this decision.

## Why @cantoo/fontkit instead of upstream fontkit

The maintained `@cantoo/fontkit` fork is browser/ESM ready, ships TypeScript types, and retains fontkit's TrueType/OpenType/CFF/WOFF parsing, metrics and subsetting surface while carrying recent fixes.

It is used only when Edit PDF needs embedded-font intelligence. It must be dynamically imported and must not enter the normal website or basic PDF discovery bundle.

The existing custom Lumeo parser remains authoritative for PDF objects, PDF encodings, ToUnicode, resource scope, content-stream provenance and write safety. Fontkit parses the **embedded font program**; it does not replace PDF semantics.

## Why HarfBuzz remains separate

Fontkit has a layout API, but Lumeo will not run two independent shaping engines for the same production edit.

HarfBuzz is reserved as the canonical shaping engine because it is purpose-built for OpenType shaping and complex-script glyph positioning. When HarfBuzz is introduced, fontkit layout may be used only in tests/diagnostics, never as a competing export authority.

## Why opentype.js is not installed

opentype.js is permissively licensed and browser-capable, but its parsing, metrics, kerning, ligature and outline functionality overlaps the chosen fontkit role. Installing both would increase bundle size and create conflicting sources of truth.

## OCR decision

Tesseract.js is Apache-2.0 and browser/WASM capable. It remains deferred until native extraction and font fidelity are stable.

OCR architecture will be:

```text
local PDF page render
  -> local image bitmap
  -> local Tesseract worker
  -> OCR word/line/confidence model
```

OCR output will never masquerade as native PDF text and will never be sent to Lumeo servers.

## Existing Lumeo responsibilities that remain custom

- PDF object/resource traversal
- page and Form XObject resource scope
- BT/ET and text/graphics state
- Tj/TJ provenance
- ToUnicode and PDF Encoding/Differences
- CID resource identity
- PDF geometry and coordinate mapping
- native content-stream rewrite
- paint/state restoration
- semantic edit history
- capability classification
- privacy/network guarantees

## Security posture

Fonts and PDFs are hostile input.

Font-program parsing must be:
- lazy and browser-local;
- bounded by existing file/page/resource limits;
- performed only on embedded bytes already extracted from the PDF;
- fail-closed on parser exceptions;
- never allowed to execute font data;
- never used to weaken the existing PDF encoding/resource guards.

No parsed font name, metric or glyph result is sufficient by itself to authorize native write-back. PDF encoding and width/resource evidence remain required.

## Bundle/loading policy

```text
Normal Lumeo pages
  -> no fontkit
  -> no HarfBuzz
  -> no OCR

Edit PDF, native/basic operations
  -> existing renderer/parser only

Embedded font intelligence required
  -> dynamically import @cantoo/fontkit

Complex shaping required
  -> later dynamically import HarfBuzzJS/WASM

Scanned page detected and user invokes recognition
  -> later dynamically import Tesseract.js + worker/WASM
```

## License record

| Component | Version decision | License | Production decision |
| --- | ---: | --- | --- |
| pdfjs-dist | existing 6.3.289 | Apache-2.0 | keep |
| pdf-lib | existing 1.17.1 | MIT | keep |
| @pdf-lib/standard-fonts | existing 1.0.0 | MIT | keep |
| @cantoo/fontkit | 2.0.12 | MIT | adopt, lazy font intelligence |
| harfbuzzjs | 1.6.2 | MIT | approved for later shaping slice |
| opentype.js | 2.0.0 | MIT | do not install |
| tesseract.js | 7.0.0 | Apache-2.0 | approved only for later OCR slice |

## Acceptance gate for @cantoo/fontkit integration

The integration PR must prove:
- exact embedded bytes remain in browser memory;
- internal PostScript/full/family/subfamily names can be read without trusting only /BaseFont;
- unitsPerEm/ascent/descent/capHeight/xHeight/weight/italic/stretch can be surfaced when available;
- malformed font input fails closed;
- no production writer behavior changes merely because fontkit parsed a font;
- package is dynamically imported;
- normal public pages do not eagerly load the font engine;
- Chromium, Firefox and WebKit Edit PDF regressions remain green.
