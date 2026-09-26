# Premium Edit PDF — font, shaping and OCR dependency decision

Status: approved architecture decision for the Edit PDF fidelity program  
Audit baseline: protected main `e75e0736066839644ee2ece84de50a8996ccfda8`

## Decision summary

Lumeo will keep one clear responsibility per font/text engine.

| Component | Decision | Intended responsibility |
| --- | --- | --- |
| `pdfjs-dist` | Keep | Independent browser renderer / extraction oracle. Not the canonical write engine. |
| Existing Lumeo PDF parser/writer | Keep | PDF objects/resources, text operators, provenance, capability guards and exact native content-stream rewrite. |
| `@cantoo/fontkit@2.0.12` | Approved for a later measured integration PR | Font-program inspection, names, metrics, coverage and deterministic subsetting where required. |
| `harfbuzzjs@1.6.2` | Approved for the shaping PR, not the fontkit PR | Canonical OpenType shaping: glyph IDs, clusters, advances and offsets for complex scripts / GPOS / GSUB. |
| `opentype.js@2.0.0` | Do not add | Substantial overlap with fontkit; a second parser/layout stack would increase bundle size and disagreement risk. |
| `tesseract.js@7.0.0` | Approved in principle for the later OCR PR only | Browser-local OCR for pages/regions proven to be scanned/image-only after native extraction is exhausted. |
| MuPDF.js / Scribe.js | Do not add without explicit legal approval | License/commercial implications are outside the approved dependency envelope. |

## Why PDF.js remains

PDF.js is already Lumeo's renderer and independent text-extraction signal. It provides a useful second view of page text and geometry, but Lumeo does not use the DOM/text layer as the canonical editor or writer. Native source operators and resources remain the write authority.

## Why fontkit

The current custom font stack now safely provides:
- PDF font-resource identity;
- Type0/CID provenance;
- embedded FontFile/FontFile2/FontFile3 extraction;
- deterministic embedded-byte fingerprints;
- PDF width metrics;
- conservative encoding maps;
- a hardened read-only SFNT Unicode cmap/maxp coverage proof for embedded TrueType subsets.

What remains missing is a broad font-program parser for professional metadata and future subsetting across TTF/OTF/CFF without growing a second large custom binary parser.

`@cantoo/fontkit` is selected for that role because it is the actively maintained fork of the original fontkit package and:
- is MIT licensed;
- supports Node and browser builds;
- supports TrueType, OpenType, WOFF/WOFF2 and CFF outlines;
- exposes names, glyph metrics, layout features and subsetting;
- is already designed as a font engine rather than a PDF engine.

### Important constraint

`@cantoo/fontkit` will **not** become Lumeo's PDF write authority and will not silently replace PDF resource/encoding evidence. It inspects exact font bytes already available locally in the browser.

### Integration gate

Do not add `@cantoo/fontkit` until the integration PR can measure:
- package-lock delta;
- production bundle delta;
- lazy chunk size;
- build compatibility in vinext/Cloudflare;
- Chromium/Firefox/WebKit browser parsing;
- security/audit output;
- no loading on non-Edit-PDF routes;
- no loading until exact embedded/local font inspection is needed.

This decision PR does not change dependencies or hand-edit `package-lock.json`; the implementation PR must regenerate the lockfile through npm and measure the resulting bundle/security impact.

## Why HarfBuzzJS

HarfBuzzJS is selected as the future canonical shaping engine because it is the browser/client-side JavaScript/WASM form of HarfBuzz and is MIT licensed.

Its responsibility will be limited to shaping:
```
Unicode/grapheme input + exact font bytes + direction/script/language/features
  -> glyph IDs
  -> cluster map
  -> x/y advances
  -> x/y offsets
```

It will not perform:
- PDF parsing;
- text detection;
- line breaking;
- page layout;
- content-stream rewriting;
- OCR.

### Avoid two shaping authorities

Although @cantoo/fontkit can perform layout, production export must not independently shape the same run through both fontkit and HarfBuzz. Planned split:

```
@cantoo/fontkit
  -> font inspection / metadata / metrics / subsetting

HarfBuzz
  -> canonical shaping
```

Where a simple PDF run does not require shaping beyond existing proven code, Lumeo may keep the simpler native path.

## Why not opentype.js

opentype.js is MIT licensed and browser capable, but its font parsing, glyph/metric, kerning/ligature and outline responsibilities substantially overlap @cantoo/fontkit.

Adding both would create:
- duplicate binary parsers;
- duplicate metric/layout APIs;
- additional bundle cost;
- more opportunities for disagreement over font identity/metrics.

It is therefore not selected unless a future measured gap exists that @cantoo/fontkit cannot satisfy.

## OCR decision

Tesseract.js is Apache-2.0 licensed and browser/WASM capable. It is suitable for a later local OCR slice, but it is deliberately not part of native-text editing.

OCR may load only when page classification proves:
- no usable native text for the relevant region; and
- image/raster evidence exists.

OCR output must remain a separate `textSource: "ocr"` model and must never be presented as an original native PDF font/resource.

Core OCR assets should be served from Lumeo-controlled origins where practical rather than relying on a third-party CDN.

## Security and privacy

All font parsing, shaping and OCR work remains browser-local for normal Edit PDF workflows.

Never send:
- PDF bytes;
- extracted document text;
- embedded font programs;
- user-selected local fonts;
- OCR page images;
- OCR text

to Lumeo or third-party processing services.

Treat font binaries as hostile input:
- bounds-check tables;
- cap table/glyph counts;
- cap memory use;
- reject malformed structures;
- run expensive parsing/shaping off the main thread where practical.

## License gate

Approved licenses in this decision:
- @cantoo/fontkit — MIT
- harfbuzzjs — MIT
- opentype.js — MIT (not selected)
- Tesseract.js — Apache-2.0

No GPL/AGPL PDF engine may enter production without an explicit separate legal/commercial decision.

## Bundle strategy

Normal Lumeo pages must not load the professional Edit PDF engines.

Target loading:
```
normal site
  -> no @cantoo/fontkit / HarfBuzz / OCR

Edit PDF initial page
  -> existing PDF.js + native parser

exact font inspection needed
  -> lazy @cantoo/fontkit chunk

complex shaping needed
  -> lazy HarfBuzz/WASM chunk

scanned page/region proven
  -> lazy OCR worker/core/language assets
```

## Acceptance before each dependency is considered integrated

1. Exact package version pinned.
2. Lockfile produced by npm, never manually fabricated.
3. License recorded.
4. Audit/security result reviewed.
5. Browser build succeeds.
6. Cloudflare Worker/free-plan constraints pass.
7. Dependency is code-split.
8. Non-Edit-PDF route bundle does not grow materially.
9. Chromium/Firefox/WebKit tests pass.
10. Existing native text/colour writer tests remain green.
11. Production smoke passes the exact deployed SHA.
