# OCR — Evaluation Spec

**Date:** 2026-08-14
**Status:** Evaluation, not an implementation plan
**Decides:** whether to build OCR at all, and if so where it runs

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

### Gate 1 — Does client-side Tesseract fit the budget? (unmeasured)

The decision that everything else follows from. `tesseract.js` ships a WASM core plus per-language `.traineddata`; both are downloads the user pays for on first use, and the language data is the larger of the two.

**Method:** install `tesseract.js`, load the WASM core and `eng.traineddata` in a real browser, record (a) transferred bytes for core + one language, (b) wall-clock time to recognise one 300-DPI A4 page on a mid-range machine, (c) peak memory. Run it under `runInWorker` so the measurement reflects the real deployment shape.

**Pass condition:** first-page-visible time stays inside what the tool catalog's perf posture allows, and the download is cacheable across sessions.

Client-side is strongly preferred if it passes — it keeps Recognize inside the no-upload guarantee, needs no Supabase bucket, no route, no external service, and no `maxDuration` ceiling. If it fails, the fallback is the word-to-pdf shape, and the catalog's existing `processing: "server"` was right by accident rather than by analysis.

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

**Catalog implications.** `processing: "server"` on the Recognize entry is currently an unbacked claim. It must be corrected to whatever gate 1 decides, and "Multi-language" needs re-costing — each language is another `.traineddata` download against the gate 1 budget, not a free toggle.

## 5. Test plan

**Unit:** the invisible-layer writer, against known bounding boxes — assert extracted string, reading order, and that the page's non-text operators are byte-identical to the input. Round-trip through pdfjs, following the `edit-apply-plan*.test.ts` pattern.

**Fixtures:** the three-class corpus from gate 2, checked in, small enough not to bloat the repo.

**Real Chrome:** mandatory for gate 1 — the numbers that matter are download size, wall-clock and memory under a real worker, and the in-app preview pane does not composite.

## 6. Open questions

- **Does OCR belong in Edit PDF, or only in Extract Text?** A restyle over a scanned page currently has nothing to select, because detection finds no runs. OCR would give Edit a run list on scanned documents — genuinely powerful, and a much larger surface than "read scan text". Out of scope here; worth its own spec once Phase 1 exists.
- **Is a failed gate 1 a reason to defer entirely?** A server round-trip makes Recognize the only tool that uploads documents. That is a product positioning decision, not an engineering one, and should be made deliberately rather than inherited from a catalog entry written before the measurement.
