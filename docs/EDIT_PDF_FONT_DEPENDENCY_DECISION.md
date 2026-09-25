# Edit PDF font and shaping dependency decision

Decision date: 2026-09-25  
Current fidelity base: `3a5bcab29e4b73cf77262e5a7c4cd40d55ddeb7d`

## Decision

Lumeo will use **HarfBuzz via `harfbuzzjs@1.6.2` as the canonical OpenType shaping engine** for supported Edit PDF operations where exact font bytes are available.

The dependency is pinned exactly rather than using a semver range so the WASM engine cannot drift independently of the code and corpus that certified it.

HarfBuzz is introduced for shaping only. It does not parse PDF objects, choose fallback fonts, perform line breaking, define page layout, become the content-stream writer, or authorize an edit by itself.

The existing Lumeo PDF/SFNT code remains responsible for:

- PDF font/resource identity and resource scope;
- PDF encoding and ToUnicode evidence;
- PDF widths and content-stream text state;
- embedded-program extraction and hashing;
- lightweight SFNT cmap/maxp glyph-presence proof;
- native rewrite capability;
- content-stream mutation/export.

## Chosen dependency

| Component | Version | License | Production role | Loading |
| --- | --- | --- | --- | --- |
| `harfbuzzjs` | 1.6.2 | MIT | canonical OpenType shaping only | dynamic/lazy, Edit PDF only |
| HarfBuzz core bundled by that package | 14.5.0, commit `863d3f7787c6df18d20e4535c5906bf3eb803bd5` | MIT | GSUB/GPOS, ligatures, kerning, complex-script shaping and glyph positioning | WASM inside the lazy HarfBuzz package |

Pinned npm integrity:

`sha512-95c1vWuzoHjM19d5fQgPbz1wcv1pTa0UM9dZrdPgSMUEVuSwuzeVPkq6UhHHw3jLOkE9AYzzTP8XQkRBpPYpEg==`

The selected HarfBuzz core is newer than the fixed range for the known 2026 null-dereference issue affecting older HarfBuzz releases. Lumeo still treats every font as hostile input and applies its own byte/text/glyph limits around shaping.

## Deferred dependencies

### fontkit 2.0.4 — deferred

License: MIT.

fontkit is capable of TTF/OTF/CFF/WOFF parsing, metrics, layout and subsetting. That is useful, but adding it now would introduce another substantial font stack plus multiple runtime dependencies while overlapping both Lumeo's existing SFNT proof code and HarfBuzz shaping.

Reconsider fontkit only when a measured requirement cannot be met by the current stack, especially:

- deterministic PDF font subsetting;
- deeper CFF/CFF2 inspection;
- internal name-table parsing that cannot be implemented safely and narrowly;
- WOFF/WOFF2 conversion for a user-selected local font workflow.

If adopted later, fontkit should be inspection/subsetting infrastructure, not a second canonical shaper.

### opentype.js 2.0.0 — deferred

License: MIT.

opentype.js overlaps the same parser/metrics/layout space and would create duplicate font logic. It is not justified while HarfBuzz is the shaper and Lumeo's own registry already owns PDF-specific font evidence.

### Tesseract.js 7.0.0 — deferred to OCR milestone

License: Apache-2.0.

Tesseract remains the preferred browser-local OCR candidate for scanned pages, but OCR is deliberately later than native text/font/shaping/geometry work. It must be lazy-loaded only after image-only text evidence is established.

## Rejected without explicit legal approval

### MuPDF / MuPDF.js

Current MuPDF JavaScript distribution is AGPL-3.0-or-later unless separately commercially licensed. It is not added to Lumeo. Any future adoption requires an explicit legal/commercial licensing decision.

### Scribe.js / scribe.js-ocr

Current package is AGPL-3.0. It is not added to Lumeo. Browser-local OCR requirements do not justify changing Lumeo's distribution obligations when permissive alternatives exist.

## Runtime and bundle policy

- No HarfBuzz import on the homepage, PDF Tools discovery page, or initial Edit PDF shell.
- The Edit PDF route remains dynamically loaded.
- The HarfBuzz module itself is loaded through `import("harfbuzzjs")` only when shaping is requested.
- Exact embedded font bytes remain in browser memory.
- Font bytes and shaped text are never sent to Lumeo or a third-party service.
- HarfBuzz output is initially diagnostic/canonical-metric evidence only; it does not immediately replace the proven PDF advance/layout path.
- The production Cloudflare/Vinext build must prove that the package's WASM asset is emitted and loadable from Lumeo-controlled deployment assets before shaped geometry can become an export authority.

## Shaping safety envelope

The first shaping adapter applies hard local limits:

- maximum embedded font bytes: 32 MiB;
- maximum source text: 8,192 UTF-16 code units;
- maximum shaped output: 16,384 glyphs;
- ASCII-only bounded explicit script/language labels;
- HarfBuzz cluster level: monotone graphemes;
- every returned cluster must align to a JavaScript grapheme boundary;
- invalid UPEM, malformed font data or invalid clusters fail closed.

These are shaping limits, not claims about safe PDF rewrite. A shaped run still needs PDF encoding, glyph, width, resource and geometry evidence before editing/export may proceed.

## Canonical responsibility split

```text
PDF font/resource + content stream
  -> PdfFontRegistry / fontEncoding / PDF metrics
  -> exact embedded font bytes
  -> HarfBuzz shaping (glyph ids, clusters, advances, offsets)
  -> shaping-vs-PDF metric comparison
  -> safe replacement geometry decision
  -> existing native content-stream writer
```

HarfBuzz does not perform paragraph layout or word-processor reflow.

## Next proof before export integration

Before HarfBuzz advances can affect the writer, Lumeo must add golden/corpus tests proving:

1. Latin no-feature text agrees with known PDF widths within deterministic tolerance.
2. Kerning and ligature cases produce stable cluster/advance results.
3. Arabic and Devanagari shape into expected cluster sequences using privacy-safe fonts.
4. RTL and vertical directions are represented correctly.
5. Browser zoom never changes shaped or exported PDF-space geometry.
6. A failed or unsupported shape never triggers silent generic-font substitution.
7. Cloudflare production serves the required WASM asset correctly in Chromium, Firefox and WebKit.

Until these proofs exist, the existing PDF metric/layout guard remains the export authority.
