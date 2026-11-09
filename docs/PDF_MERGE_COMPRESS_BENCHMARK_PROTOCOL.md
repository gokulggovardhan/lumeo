# Lumeo Merge & Compress PDF — Measured Benchmark Protocol

## Purpose and scope

This protocol supplements the existing PDF Workspace release gate with **actual measured byte counts** and native document-integrity checks. The benchmark is intentionally deterministic and uses generated synthetic PDFs; it does **not** claim to represent a real scanned-photograph corpus or to prove superior visual quality on all user inputs.

The test entrypoint is `tests/pdf-merge-compress-benchmarks.test.ts`. Run with the repository's existing Node runtime:

```bash
node --no-warnings --test --experimental-strip-types tests/pdf-merge-compress-benchmarks.test.ts
```

The normal `npm test` CI gate also discovers this test. Successful lines begin with `[pdf-engine-benchmark]`, followed by one JSON object per synthetic fixture.

## Fixtures

| Fixture | Real operation | What can be verified |
| --- | --- | --- |
| 12-page native selectable text | Lossless object-stream rewriting | Exact serialized bytes, page count, text extraction |
| 3 pages with a shared JPEG carrying redundant COM metadata | JPEG-resource replacement via a deterministic codec stub that removes only metadata | Serialized byte savings, shared-page text preservation |
| Form-protected PDF | Fail-closed optimization | Exact original size and preservation of AcroForm field |
| 5-page mixed-page-size document | Native page merge with source rotation | Page count, source order, original sizes, selectable text, rotation |

## Report fields

- `inputBytes`, `outputBytes`, `savedBytes`, `savedPct`: **measured actual bytes**.
- `durationMs`: measured wall time for this invocation; varies with CI machine, browser, CPU and fixture.
- `observedHeapDeltaBytes`: before/after Node heap observation; **not** peak heap or a hardware memory guarantee.
- `textPreserved`: text extracted using PDF.js from the result, not a visual similarity metric.
- `protected` / `formFieldsPreserved`: safe handling of an interactive form.
- `mode`: the native optimization action under test.

## Interpretation and release limits

1. This is an initial synthetic **current-engine performance baseline**. It is not a historical A/B benchmark against the old Lumeo production compressor.
2. The image fixture's codec stub removes JPEG metadata, so its compression ratio is **not** representative of real photographic JPEG encoding.
3. Actual browser JPEG encoding, scan legibility, colour management, visual SSIM, PDF/A conformance, signatures, annotations, complex forms and iOS Safari remain subject to their own document/browser tests.
4. No performance threshold should be inferred from one run. Do not weaken integrity tests to increase savings or to force a benchmark to pass.
5. Before claiming a before-versus-after improvement, run the same representative real-file corpus against the old pinned release and the proposed release and record both sets of outputs. Private documents must remain local; never attach their contents to CI logs.
6. Never claim a requested target-size was achieved without exact serialized bytes at or below the target and a valid output integrity check.

The canonical protected production deployment and Workspace certification checks remain mandatory and separate from this benchmark.
