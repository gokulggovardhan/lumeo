# Lumeo Merge/Compress PDF — Phase 1 open-source technology decision

**Status:** Phase 1 engineering candidate, pending protected CI and review.  
**Baseline:** protected `main` `3fb23d60a542659c8588f2394c6744831731c68e`, lockfile version 3, 2026-11-09.  
**Decision:** retain existing browser-first `pdf-lib` + PDF.js worker architecture. Do **not** add new PDF binaries, paid services or upload endpoints.

## Candidate evaluation

| Technology | Verified upstream licence | Browser/worker role | Decision |
| --- | --- | --- | --- |
| `pdf-lib` 1.17.1 | MIT | Native PDF object/page manipulation, copying, serialized output and metadata | **KEEP**: already integrated and production-tested, with output integrity guards |
| `pdfjs-dist` 6.4.299 | Apache-2.0 | Independent PDF parsing, rendering and searchable-text verification; PDF.js worker | **KEEP**: not treated as a native writer; matched to current lockfile |
| `@cantoo/fontkit` 2.0.12 and `@pdf-lib/fontkit` 1.1.1 | MIT | Existing font/shaping support; not substitute PDF writers | **KEEP** existing pinned packages |
| `@pdf-lib/standard-fonts`, `@pdf-lib/upng` | MIT | Transitive standard-font and PNG utilities | **KEEP**, no replacement required |
| `jszip` 3.10.2 | MIT **or** GPL-3.0-or-later | Existing ZIP/export workstream; MIT licence alternative selected | **KEEP** without introducing GPL obligations by choosing the MIT grant |
| `qpdf` native/WASM port | Apache-2.0 | Potential PDF graph/stream transformer if a tested browser/WASM build is later justified | **DEFER**: no proven worker size, memory, browser bundle or fidelity advantage for Lumeo yet |
| `MuPDF.js` / MuPDF | AGPL-3.0 or commercial | Capable PDF renderer/editor but licensing can impose source-disclosure/commercial costs | **DO NOT ADOPT** in the existing proprietary/unspecified-licensing and ₹0-cost scope |
| Ghostscript | AGPL-3.0 or commercial | Strong command-line rewriter, not a browser-first native worker | **DO NOT ADOPT** for this scope |

Upstream primary references:
- `pdf-lib` MIT: https://github.com/Hopding/pdf-lib/blob/master/LICENSE.md
- PDF.js Apache-2.0: https://github.com/mozilla/pdf.js/blob/master/LICENSE
- qpdf Apache-2.0: https://github.com/qpdf/qpdf/blob/main/manual/license.rst
- MuPDF: https://mupdfjs.readthedocs.io/en/latest/faq/index.html
- Artifex Ghostscript/MuPDF: https://artifex.com/licensing

## Lockfile and distribution boundary

The current locked PDF-core runtime graph (direct engines, fontkit and ZIP exporter, recursively following **required** npm dependencies; excluding optional Node-only packages) comprises **22 packages**. Their lockfile SPDX choices are MIT, Apache-2.0, 0BSD, ISC, or the permissive clauses of `(MIT AND Zlib)` and `(MIT OR GPL-3.0-or-later)`. The precise installed versions are in `package-lock.json`, not an estimated range. The policy test enumerates that same required closure and fails on missing metadata or an unreviewed licence. npm metadata is not independently authoritative legal advice.

**Other Lumeo components are a separate compliance surface:** the project also locks `libheif-js` (LGPL-3.0) and platform-specific sharp/libvips binaries (LGPL-3.0-or-later). These are **not being selected as new native Merge/Compress PDF engines**; do not casually reclassify them as permissive or remove the existing conversion functionality. Before claiming whole-application licence compliance, audit whether/how those components are actually distributed and satisfy their licence obligations.

**Notices remain an explicit packaging duty**, regardless of this technology selection: distribute required MIT copyrights/notices, the Apache-2.0 license and applicable NOTICE material, and all required bundled PDF.js component attributions. This phase chooses technologies; it does not assert that all transitive production assets and notices have already passed a whole-application legal audit. Record the shipped-artifact/notice check as a release obligation in Phase 12/16.

## Processing suitability and acceptance

1. Keep PDF file contents on the device in Web Workers where supported. No new external PDF upload endpoint or paid service.
2. Native merge must preserve page order, dimensions, rotations, native selectable text and supported annotations/content. Existing protected/unsupported constructs must fail safely rather than silently degrade.
3. Only run lossless native reserialization and eligible image-resource changes through existing candidate validation. A smaller byte length alone is **not** a fidelity certificate.
4. `pdf-lib` is a writer, PDF.js an independent read/render oracle; use both in later structural/visual comparisons.
5. Image encoder, target-size search, UI, browser, privacy, memory and final production certifications remain separate Phases 2–16 and must not be claimed by this licensing decision.
6. No new npm package was introduced. Scoped automated test: `node --no-warnings --test --experimental-strip-types tests/pdf-engine-license-policy.test.ts`, plus normal `npm test` and protected PR CI.

**Phase 1 acceptance gate:** this decision, its provenance and the automated license-policy test must pass protected CI; confirm no loss of existing PDF features. Future dependency upgrades require explicit licence re-review and real browser/regression tests.
