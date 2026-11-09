# Lumeo Merge/Compress — Phase 0 repository baseline (2026-11-09)

> **Point-in-time engineering evidence, not a production release certificate.**
> The phase must remain open until its applicable acceptance gates pass.
> Verify newer GitHub/Cloudflare state before relying on any status below.

## Immutable source baseline

- Repository: [gokulggovardhan/lumeo](https://github.com/gokulggovardhan/lumeo).
- Default, protected branch: `main`.
- Observed main SHA: `552062f14df652861d0a4ed809547e53096ee50b` (merged PR [#694](https://github.com/gokulggovardhan/lumeo/pull/694)).
- Primary production service: Cloudflare Worker `lumeo-app`, custom domain `https://lumeo.in`.
- Cloudflare deployment observed at `2026-11-09T08:00:31Z`: deployment `34bdec46-1dc3-431b-953a-0f955cf85541`, Worker version `f1b5fa86-1d93-4571-9570-de6d3438fddd` (version #273), 100% traffic.
- [Production Health run #710](https://github.com/gokulggovardhan/lumeo/actions/runs/42582766221) passed at this main SHA; its workflow checks /api/build-info for the exact SHA and production environment plus public routes/admin boundaries. This is **not** equivalent to completed browser-operation certification.
- [Full live Merge/Compress certification run #111](https://github.com/gokulggovardhan/lumeo/actions/runs/42582766174) was still in progress at inspection. Its 12 native-operation checks must finish successfully before the release can be certified.
- Repository instructions: `CLAUDE.md`, `README.md`, `.github/LUMEO_DEVELOPMENT_CONTINUITY.md`. The last document references historical issue #365, which is closed and stale; current protected main and active checks take precedence.
- Issue search at inspection: no open issues. Open PRs: [#693](https://github.com/gokulggovardhan/lumeo/pull/693) benchmark (in scope), [#695](https://github.com/gokulggovardhan/lumeo/pull/695) Graphify (maintenance), [#696](https://github.com/gokulggovardhan/lumeo/pull/696) grouped dependencies (unrelated; failing at inspection). Neither #695 nor #696 is part of PDF Phase 0 acceptance.

## Observed implementation, not yet full certification

- Native PDF merge: `lib/pdf/merge/nativeMerge.ts`; isolated worker/client: `nativeMerge.worker.ts`, `mergeWorkerClient.ts`; UI: `components/pdf/MergePdfTool.tsx`.
- Native and image compression: `lib/pdf/optimization/{nativeImages,compressionPipeline,compression.worker,compressionWorkerClient,adaptiveTarget,nativeJpegCodec,validateOutput,fidelity}.ts`; UI: `components/pdf/CompressPdfTool.tsx`.
- Existing detection/intelligence in `lib/pdf/compressionIntelligence.ts`; existing compression target regression tests in `tests/compression-target.test.ts`.
- `nativeMerge.ts` explicitly bounds inputs to 128 MiB and 600 pages and rejects unsafe rotations; these are current behavior, not throughput guarantees.
- Browser-first implementation: pdf-lib + PDF.js, Web Workers. No new backend document-processing architecture or paid dependencies are proposed.
- Existing README explicitly protects Merge/Split behavior; changes must respect the user's current scope, preserve Workspace continuation, selectable text, page geometry, annotations/forms as supported, and original-quality merging by default.
- The presence of an implementation or test source is **not** evidence that all real-world PDF types, image quality, cross-browser cases, or performance thresholds are certified.

## Reproducible synthetic benchmark — single successful 2026-11-09 CI execution

Source: [PR #693 Core Workspace CI job](https://github.com/gokulggovardhan/lumeo/actions/runs/42542616422/job/128920832968), `npm test`; 1,412 unit tests passed, 0 failed. Entry point: `tests/pdf-merge-compress-benchmarks.test.ts`. Values below were emitted by the actual run, **not estimates**.

| Synthetic operation | Input bytes | Output bytes | Savings | Wall time | Integrity observation |
| --- | ---: | ---: | ---: | ---: | --- |
| 12-page selectable-text lossless rewrite | 13,937 | 7,393 | 46.95% | 182.76 ms | 12 pages; extracted text preserved |
| 3-page repeated JPEG with redundant COM metadata | 16,828 | 1,926 | 88.55% | 18.75 ms | 3 pages; extracted text preserved |
| Protected AcroForm fallback | 17,784 | 17,784 | 0.00% | 1.54 ms | 1 form field; unchanged original |
| 5-page native merge with a 90-degree source rotation | 7,134 (sum of sources) | 3,389 | 52.50% smaller than combined inputs | 24.75 ms | 5 pages; text, order, page size, rotation checked |

**Limits:** one CI runner, generated synthetic PDFs, no historic A/B comparison, no scanned-photo SSIM/PSNR, no peak-memory numbers, no large real-document corpus. The JPEG fixture uses a deterministic metadata-stripping codec stub: its 88.55% figure is **not** evidence of ordinary photographic JPEG compression. The merge byte ratio is **not** a compression-quality score. Timings vary across machines. See `docs/PDF_MERGE_COMPRESS_BENCHMARK_PROTOCOL.md`.

Reproduce on a prepared Node 24 environment using the locked project dependencies:

```sh
npm ci
node --no-warnings --test --experimental-strip-types tests/pdf-merge-compress-benchmarks.test.ts
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run build:vinext
```

Run the repository's full protected CI/browser gates as well. To validate the **deployed** revision separately, execute the workflow `.github/workflows/workspace-production-certification.yml`, which first matches `/api/build-info` to the candidate `main` SHA and then runs real Merge/Compress Playwright operations.

## Confirmed engineering boundaries and remaining Phase 1–16 evidence

These findings describe code already read from the pinned baseline. They do **not** start or certify any next phase.

| Area | Existing implementation / safety rule | Unresolved acceptance evidence |
| --- | --- | --- |
| PDF graph analysis | `nativeImages.ts` re-parses PDF, enumerates indirect JPEG streams, and checks page/resource metadata. | Structural and resource-classification corpus still needs broader coverage (Phase 3). |
| Native lossless mode | Object stream rewrite is accepted only if the final serialized file is smaller, and the candidate is parsed again. | Formal integrity tests beyond page count, including text operators, annotations and edge-case PDFs (Phases 4, 12). |
| Lossy image coverage | Only canonical opaque 8-bit `/DeviceRGB` `/DCTDecode` JPEG XObjects are eligible. Other filters, masks, unusual dictionaries and ICC/CMYK profiles remain untouched. | Supported-format matrix, colour/metadata tests and a **representative real-image** corpus (Phases 5, 13). |
| Fidelity guard | The worker checks a bounded 96×96 decoded image sample, computes PSNR/MAE and a separate fidelity proxy. | No proven whole-page readability/SSIM/PSNR benchmarks or fine-print/photo corpus; do not present sampled score as full visual certification (Phases 5, 13). |
| Adaptive target | `adaptiveTarget.ts` runs bounded byte-measured candidates; may truthfully return `closest-safe` or `no-benefit`. | Real-document target hit rates, nonmonotonic-size stress tests, mobile memory bounds (Phases 6, 13). |
| Merge input safeguards | `nativeMerge.ts` preserves native page content and source rotations, with a 128 MiB combined-file and 600-page cap. It refuses forms, signatures, bookmarks, annotations and other protected structures rather than silently stripping them. | Mixed PDF page boxes, Unicode/searchable text, safe handling of interactive documents, cross-browser output (Phases 7, 12). |
| Compression limits | `nativeImages.ts` caps input at 80 MiB, pages at 600 and distinct JPEG references at 256. | Record these in UI and large-file tests; do not imply unlimited-device or big-scanned-document support (Phases 10, 11, 13). |
| Output validation | `validatePdfOutput.ts` checks successful PDF load and exact page count; this alone cannot prove all bytes, text, visual layers or metadata survived. | Independent parsing, rendered comparison, security-malformation tests and regression corpus (Phases 12, 13). |
| Browser isolation | Native compression uses a worker, `OffscreenCanvas` and `createImageBitmap` when available; unsupported browsers retain safe lossless/no-op handling. | Cancellation/memory measurement and cross-browser/mobile stability evidence (Phases 11, 13). |
| UI and Workspace | Merge and Compress native tool components and Workspace continuation exist in current main. | Premium desktop/mobile quality, target-size interaction, accessibility and Workspace regression acceptance (Phases 8–10, 12). |
| Open source / licenses | Current source imports `pdf-lib` and `pdfjs-dist`; no new paid service or remote document transport was introduced here. | Review precise installed versions, transitive licenses and legal distribution requirements before certification (Phase 1). |
| Release evidence | Main SHA/Cloudflare deployment and route health are traceable; exact-production Merge/Compress browser run is not yet passing. | Required checks, all in-scope regressions, exact deployed SHA and completed real operations (Phases 14–16, and Phase 0 baseline gate). |

Do not treat intentional fail-closed behavior as a silent feature success: if a user-supplied PDF has unsupported protected structure, neither a rewritten PDF nor a compression percentage should be claimed. Scope and quality upgrades must be supported by real output tests.

## CI and blocker disposition at inspection

1. PR #693's `Core Workspace fidelity and build` and `Validate Lumeo PDF Workspace` passed. Its `Admin auth — Chromium + WebKit` job failed during `supabase start` on Inbucket's host port `54324` (already in use); this prevented Admin tests running. The same collision recurred in all three retries, so the retry loop alone is not a fix. Source: [job logs](https://github.com/gokulggovardhan/lumeo/actions/runs/42542616422/job/128920833058).
2. Corrective PR #693 branch commit `7b9c450704a95810fde68b9c954a8bfeb4ab2679` disables unused Inbucket in this isolated Admin job, matching the existing catalog Workspace CI pattern. **Retest must pass before merge; no result is pre-certified.** This does not change the production Supabase project.
3. Main SHA `552062f` CodeQL Actions-language analysis failed at download time because GitHub's CodeQL bundle URL returned HTTP 504. JavaScript/TypeScript and Python CodeQL jobs passed. This was a tool download failure, **not evidence of successful CodeQL analysis**. Source: [run](https://github.com/gokulggovardhan/lumeo/actions/runs/42582765071). A targeted job rerun was rejected by GitHub with HTTP 403; this remains an independent verification blocker until a successful run.
4. At inspection, current-main full Lumeo CI, Mobile Lighthouse, and post-deployment browser-operation certification were still in progress. Do not promote pending checks to PASS.
5. PR #696 had failures in the core build/release gate. Keep unrelated dependency upgrades isolated and do not force-merge. PR #695 is autogenerated Graphify maintenance, not an implicit Phase 0 requirement.
6. External read-only page retrieval from the audit runtime did not directly render the live PDF UI. GitHub's production health and deployment evidence are distinct, observable checks; they must not substitute for a clean actual browser processing run.

## Verified post-inspection results (2026-11-09)

After the original baseline inspection, [production certification run #111](https://github.com/gokulggovardhan/lumeo/actions/runs/42582766174) **failed** on `552062f14df652861d0a4ed809547e53096ee50b`. Its exact-SHA check, route checks, Admin boundary, and Phase 11 recovery passed, but its general conversion step reported **28 passed, 13 skipped, and 3 failed**. The failed Word → PDF cases were:

- Chromium, repeated real conversion: the selected DOCX's Remove action was not found within 120 seconds.
- Chromium, conversion smoke: `Convert to PDF` was not found within 180 seconds after a synthetic local DOCX selection.
- Firefox, capability test: the readiness/recovery state remained `waiting` for 180 seconds.

Because the broad conversion suite failed, the **12 new real Merge/Compress tests were skipped** in run #111. Therefore `552062f` is **not production-certified** despite successful route health, deployment and most other checks. Do not infer failure or success of native Merge/Compress from a skipped step.

The Phase 0 branch now also includes a guarded Word file-selection acknowledgement in the production conversion tests: observe the selected filename even while the engine is loading; retry a dropped browser synthetic file-change event **once**; if it remains absent, fail the test. This is a bounded browser-test reliability correction, not a production Word conversion engine fix or a relaxation of assertions. The production certification workflow now executes real native Merge/Compress tests *before* the conversion suite so those results cannot be skipped due to unrelated Word conversion failures. The conversion suite remains a mandatory failing gate if it regresses.

Main CodeQL Actions-language run [#2820](https://github.com/gokulggovardhan/lumeo/actions/runs/42582765071) failed downloading an upstream CodeQL bundle (GitHub HTTP 504). GitHub rejected both job-level and failed-run retry requests with HTTP 403. Successful current-head CodeQL and release gates are still required.

This addendum preserves the original, time-qualified baseline while correcting its later observed production-certification state. It does not certify any pending PR or deployment.

### Confirmed local Office-runtime 504 evidence and bounded correction

The failed current-main conversion corpus ([run #710's Lumeo CI](https://github.com/gokulggovardhan/lumeo/actions/runs/42582766264)) reported 58 passed, 40 skipped, 2 failed. Inspection of its uploaded `workspace-release-conversion-report` Playwright traces—not merely the CI summary—found repeated local `HEAD /office-runtime/zeta-24-2-2026-09-21-a/soffice.js` responses of HTTP **504**, with the Word conversion lab displaying the actual recovery message that its local engine could not be loaded. A separate failing trace showed Office JS/WASM assets served HTTP 200 but subsequent Office startup dependencies did not complete; these are two observed paths, not proof of one universal cause.

The Next.js `app/office-runtime/[release]/[asset]/route.ts` fetches pinned immutable assets from the existing GitHub release. Unlike the Cloudflare Worker fast path, this fallback originally made only **one** upstream attempt per incoming request. The Phase 0 branch now adds `lib/conversion/runtimeAssetUpstream.ts` with up to **three bounded retries** for transient 408/425/429/5xx or network errors, carrying the method, Range header, original cancellation signal and unbuffered response stream through unchanged. Non-transient errors and persistent outages continue to fail clearly. Six direct tests in `tests/conversion-office-runtime-upstream.test.ts` cover recovery, range/streaming, non-transient rejection, network failure, retry exhaustion and cancellation. This is **not** yet evidence of the actual Word converter passing in CI or production; it is a focused fix for the observed GitHub 504 availability path without changing PDF document privacy.

## Phase 0 acceptance gate

Phase 0 is **not closed** in this snapshot. Close only after:

- The synthetic benchmark/doc/fix changes land through a passing protected PR with review requirements honored.
- Any in-scope CI failures are resolved and the accepted main revision passes all required checks.
- The exact final deployed `main` SHA is confirmed, including actual Merge + Compress output/download on production across the required browser suite.
- Remaining limitations/gaps for Phases 1–16 are recorded honestly; no quality or performance claim exceeds its evidence.
- No existing Workspace functionality is regressed.

**Next development phase:** Phase 1 only after every Phase 0 gate above is positively evidenced. Until then, remain on Phase 0.
