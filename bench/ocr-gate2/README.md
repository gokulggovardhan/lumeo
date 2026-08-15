# OCR Gate 2 — accuracy benchmark

Measures Character and Word Error Rate for Tesseract across three document-quality classes, so the OCR evaluation spec's Gate 2 can be decided on numbers instead of intuition.

## Running it

```bash
node --no-warnings --experimental-strip-types bench/ocr-gate2/setupAssets.ts
node --no-warnings --experimental-strip-types bench/ocr-gate2/generateCorpus.ts
node --no-warnings --experimental-strip-types bench/ocr-gate2/run.ts
```

`setupAssets` is the only step that touches the network — it downloads `eng.traineddata.gz` once. The benchmark itself replaces `globalThis.fetch` and **fails the run** on any `http(s)` request, so `zeroExternalRequests` in the report is a measurement rather than an intention. This matters because Gate 1a established that tesseract.js defaults every asset path to `cdn.jsdelivr.net`.

Fixture images and the language model are gitignored; the generator is deterministic (fixed seeds), so regenerating reproduces them byte for byte. Ground truth and `reports/latest.json` are committed.

## The corpus

All three classes render the **same three documents** (invoice, receipt, letter — `documents.ts`), so a difference in error rate between classes is attributable to the degradation and nothing else.

| Class | Stands for | Applied |
|---|---|---|
| `class-a-clean` | a properly scanned printed page | none — 300 DPI A4, direct render |
| `class-b-skewed` | the same page fed in crooked | 2.6° skew, paper tint, noise σ10 |
| `class-c-photos` | a hand-held phone photo | framed to content, 1.4° skew, anisotropic scale, blur r2, vignette, noise σ8, JPEG q42 |

## ⚠ These are simulations

**No fixture here is a real scan or a real photo.** Class B and C are synthetic degradation, and the schema records that in every ground-truth file (`origin: "synthetic-degraded"`) so a report can never be read as if it came from real captures.

The rates are sound for **comparing configurations** and for showing **how error scales as quality drops**. They are not a basis for a shippable absolute threshold on real-world photos. Real sensor noise is spatially correlated; real phone ISPs denoise flat regions hard; real lenses add distortion this does not model. Closing Gate 2 for production needs real captures — a handful of flatbed scans and phone photos of the same printed pages.

## What the first class-C attempt got wrong

Worth recording, because the first numbers were dramatic and wrong, and the mistake is easy to repeat.

The initial class-C fixtures photographed the **whole A4 sheet**, leaving the bottom two-thirds blank, with per-pixel noise at σ20. Tesseract scored **CER 3.88** on them — nearly four edits per reference character, i.e. worse than emitting nothing — at confidence 22.

That looked like "OCR cannot read photographs". It was not. The same image cropped to its text block scored **93% confidence with near-perfect text**. The blank expanse of noise was dominating layout analysis: Tesseract found "text" in the noise field and lost the real content. And σ20 per pixel at 300 DPI is not what a phone produces — its ISP smooths flat regions, which is exactly why real photos of paper have clean white areas.

Two fixes, both in `generateCorpus.ts`: frame the shot to the document's ink bounding box the way a person actually holds a phone, and drop noise to σ8. Class C then scores CER 0.047.

**The product lesson outlives the fixture bug:** a page with large, noisy, empty regions collapses Tesseract's layout analysis even when every glyph is legible. If Recognize ships, cropping to content — or at minimum binarising before recognition — is not an optimisation, it is a correctness requirement. A user photographing a receipt on a desk will hand us exactly the failing case.

## Thresholds

`thresholds.ts` holds **proposals, not ratified targets** — the spec deliberately left them blank, and inventing a number before measuring is what this exercise exists to avoid. The report marks them `thresholdsAreProposals: true`.

## Results (2026-08-15, tesseract.js 7.0.0, eng 4.0.0_best_int)

| Class | CER | target | WER | target | Mean confidence |
|---|---|---|---|---|---|
| `class-a-clean` | 0.0000 | 0.02 | 0.0000 | 0.05 | 94.7 |
| `class-b-skewed` | 0.0025 | 0.05 | 0.0117 | 0.12 | 92.3 |
| `class-c-photos` | 0.0469 | 0.15 | 0.0739 | 0.30 | 90.0 |

All three meet their proposed targets, and **confidence tracks error usefully** — it fell from 95 to 22 on the pathological fixtures above while the text was garbage, which is the signal a confidence gate would key on.

## Layout

```
bench/ocr-gate2/
  documents.ts       corpus text, shared by all classes
  degrade.ts         blur / noise / vignette, deterministic PRNG
  generateCorpus.ts  renders fixtures + ground truth
  groundTruth.ts     zod schema and loader
  evaluate.ts        CER / WER (pure; unit-tested in tests/)
  thresholds.ts      proposed per-class targets
  setupAssets.ts     one-time language-model download
  run.ts             the harness
  reports/latest.json
```

`evaluate.ts` and `groundTruth.ts` are covered by `tests/ocr-gate2-evaluate.test.ts` and `tests/ocr-gate2-corpus.test.ts`, which run in the normal suite without images or Tesseract.
