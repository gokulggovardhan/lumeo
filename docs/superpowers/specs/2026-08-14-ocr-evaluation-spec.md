# OCR — Evaluation Spec

**Date:** 2026-08-14
**Status:** Evaluation, not an implementation plan
**Decides:** whether to build OCR at all, and if so where it runs
**Gates:** 1 and 3 measured and passing; 1a measured and constraining; 2 (accuracy) still open

---

## 1. What this document is

An *evaluation*. The catalog already pre-commits to an answer — `lib/tools/catalog.ts:194-206` declares the Recognize tool with `processing: "server"` and the tagline "via free Tesseract". That commitment was made before anything was measured, and it is the main thing this document exists to test.

The pattern that produced PR #242 applies here: measure first, then decide. Two of the three assumptions below turned out differently than expected once probed, and one has already been settled (§4).

## 2. What the codebase has today

**A scanned-PDF detector, already shipped.** `isEffectivelyEmpty(pageTexts)` in `lib/pdf/textExtraction.ts:11` returns true when every page's text layer is blank. `ExtractTextTool.tsx:180` consumes it and renders the dead end at line 258:

> No selectable text found — this looks like a scanned document.

That string is the entire product case for OCR in one sentence, and it is where the feature attaches. No new detection work is needed.

**Page rasterization**, via `PdfToJpgTool` and `lib/pdf/pdfjs.ts` — OCR's input is a page bitmap, which the codebase already knows how to produce at a chosen scale (`quantizeRenderScale`, #240).

**A worker harness with no users.** `lib/workers/toolWorkerClient.ts` — `runInWorker` with progress reporting and a 120s timeout, written explicitly for "the next tool" and never adopted. OCR is CPU-bound, multi-second-per-page work; it is exactly the case that harness was built for.

**A server-tool precedent.** `app/api/tools/word-to-pdf/route.ts` brokers to an external LibreOffice service, Node runtime, `maxDuration = 300`, with Supabase storage for the upload. If OCR runs server-side, this is the shape it copies — including the upload, the storage bucket, and the deletion step.

**A privacy claim that server OCR complicates.** `app/security/page.tsx:117` lists "No external OCR for current supported workflows." The qualifier "current supported" means server OCR would not make that line false — but it does mean the page would need a new line stating that Recognize uploads documents, and Recognize would sit outside the no-upload guarantee every currently shipped tool honours.

## 3. The three gates

### Gate 1 — Does client-side Tesseract fit the budget? (**measured — passes**)

Measured with `tesseract.js@7.0.0` in real Chrome, via a throwaway `/bench-ocr` route, on a synthetic 300-DPI A4 invoice page (2480×3508, 14 lines).

**Asset budget, first use:**

| Asset | Transfer | Notes |
|---|---|---|
| `tesseract-core-simd-lstm.wasm` | ~1.01 MB gzipped | 2.73 MB raw |
| `eng.traineddata.gz` | 2.82 MB | already compressed; does not shrink further |
| `worker.min.js` | 0.11 MB | |
| **Total** | **~3.9 MB** | once per user per language |

Cached afterwards — `.traineddata` in IndexedDB by the library itself, the core via HTTP cache. A second run with a warm cache dropped init from 865 ms to 261 ms.

**Wall clock, self-hosted, cold IndexedDB:**

| Phase | Time |
|---|---|
| Load core + language data | 865 ms |
| Recognise one 300-DPI A4 page | 2318 ms |
| **Total to first result** | **3183 ms** |

Warm repeat runs: 1816–2318 ms recognise, 261–445 ms init. Recognition time is the floor and it is per page, so a 20-page scan is roughly 40 s of compute — which is a progress-bar problem, not a blocker, and exactly what `runInWorker`'s progress callback exists for.

**Peak memory: not measured.** `performance.memory` reads the page's heap, and tesseract.js runs the core inside its own Web Worker, so the figure stayed flat at 37–45 MB across every run and reflects the page, not the OCR. Measuring the worker's heap needs a different instrument; recorded here as an open number rather than a passing one.

**Verdict: client-side is viable.** ~3.9 MB one-off and ~2 s per page is a real cost but a payable one, and it keeps Recognize inside the no-upload guarantee. `processing: "server"` in the catalog should be corrected to `"browser"`.

#### Gate 1a — the CDN default (**measured — must be overridden**)

Left at its defaults, `tesseract.js` fetches all three assets from `cdn.jsdelivr.net`:

- `workerPath` → `node_modules/tesseract.js/src/worker/browser/defaultOptions.js:11`
- `corePath` → `node_modules/tesseract.js/src/worker-script/browser/getCore.js:14`
- `langPath` → `node_modules/tesseract.js/src/worker-script/index.js:130`

That means the out-of-the-box integration sends three third-party requests at the moment a user OCRs a document — carrying their IP to jsdelivr, and directly undercutting the privacy posture that is this product's whole positioning. The first benchmark run did exactly this before it was caught.

All three are overridable, and the measured numbers above come from the self-hosted configuration:

```ts
await createWorker("eng", undefined, {
  workerPath: "/tesseract/worker.min.js",
  corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
  langPath: "/tessdata",
  gzip: true,
});
```

Confirmed working, with zero requests to any CDN. **Self-hosting is a hard requirement, not a preference** — and it means the ~3.9 MB is served from Lumeo's own origin, which is a bandwidth cost worth noting before "Multi-language" is promised.

### Gate 2 — Is the accuracy worth shipping? (unmeasured)

Tesseract on a clean 300-DPI scan is good; on a phone photo of a receipt it is not. A tool that silently returns garbage is worse than the honest dead end `ExtractTextTool` shows today.

**Method:** a fixture set of at least three classes — clean scan, skewed scan, phone photo — scored by character error rate against known ground truth.

**Pass condition:** a stated CER threshold per class, plus a decision on what to do below it. Preference, consistent with how this codebase handles the un-editable cases in the edit engine: refuse with a specific reason rather than emit low-confidence text. Tesseract reports per-word confidence; that is the signal to gate on.

Deskew is listed in the catalog as a separate action. It is more accurately a *precondition* for gate 2 passing on the skewed class, not a feature.

### Gate 3 — Can a searchable PDF actually be written? (**measured — passes**)

The headline deliverable is "Searchable PDF": the original page image untouched, with an invisible text layer over it so search and selection work.

This was the assumption most likely to block the feature. The reflow spec (§3 of `2026-08-13-text-reflow-spec.md`) established that the edit engine can only *substitute* within an existing operator's byte range, never insert — and an OCR text layer is new content that no existing operator covers.

**That constraint does not apply here.** The text layer is *appended to the page*, not inserted into an existing operator's range, and pdf-lib supports this directly:

- `TextRenderingMode.Invisible` (= 3) — `node_modules/pdf-lib/cjs/api/operators.d.ts:63-73`
- `page.pushOperators(...)` — `node_modules/pdf-lib/cjs/api/PDFPage.d.ts:658`

Probed end to end: a page-sized filled rectangle standing in for a scan, with three word-positioned invisible show-operators appended via `pushOperators(pushGraphicsState(), beginText(), setTextRenderingMode(Invisible), setFontAndSize(...), setTextMatrix(...), showText(...), endText(), popGraphicsState())`. Reloaded with pdfjs, `getTextContent()` returned:

```
["INVOICE","","Total"," ","1350.00"]
```

Extractable, in the right reading order, with the page's visual output unchanged. The engine capability OCR needs already exists and needs no new insertion primitive.

## 4. Scope, if the gates pass

**Phase 1 — read scan text.** OCR to plain text, surfaced where `ExtractTextTool` currently dead-ends. No PDF writing at all. Smallest useful thing, and it needs only gates 1 and 2.

**Phase 2 — searchable PDF.** The invisible-layer write proven in gate 3, using Tesseract's per-word bounding boxes for positioning. Depends on Phase 1 being accurate enough to be worth embedding.

**Non-goals:** layout reconstruction, table recognition, handwriting, and any model that is not a local free engine. Per the standing product constraint — free backends, no AI services — a cloud OCR API is out of scope regardless of accuracy.

**Catalog implications.** `processing: "server"` on the Recognize entry is wrong — gate 1 measured client-side as viable, so it should read `"browser"`. "Multi-language" needs re-costing: each language is another ~3 MB `.traineddata`, self-hosted and served from Lumeo's origin, not a free toggle.

**Security-page implications.** If Recognize ships client-side and self-hosted, `app/security/page.tsx:117` can drop its "current supported workflows" qualifier for OCR entirely — the stronger claim becomes true. That only holds as long as the CDN defaults stay overridden, which makes gate 1a's config something to guard with a test rather than a comment.

## 5. Test plan

**Unit:** the invisible-layer writer, against known bounding boxes — assert extracted string, reading order, and that the page's non-text operators are byte-identical to the input. Round-trip through pdfjs, following the `edit-apply-plan*.test.ts` pattern.

**Fixtures:** the three-class corpus from gate 2, checked in, small enough not to bloat the repo.

**Real Chrome:** mandatory for gate 1 — the numbers that matter are download size, wall-clock and memory under a real worker, and the in-app preview pane does not composite.

## 6. Open questions

- **Does OCR belong in Edit PDF, or only in Extract Text?** A restyle over a scanned page currently has nothing to select, because detection finds no runs. OCR would give Edit a run list on scanned documents — genuinely powerful, and a much larger surface than "read scan text". Out of scope here; worth its own spec once Phase 1 exists.
- **Is a failed gate 1 a reason to defer entirely?** A server round-trip makes Recognize the only tool that uploads documents. That is a product positioning decision, not an engineering one, and should be made deliberately rather than inherited from a catalog entry written before the measurement.
