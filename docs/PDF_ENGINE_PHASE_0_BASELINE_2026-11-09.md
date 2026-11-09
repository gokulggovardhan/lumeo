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

## CI and blocker disposition at inspection

1. PR #693's `Core Workspace fidelity and build` and `Validate Lumeo PDF Workspace` passed. Its `Admin auth — Chromium + WebKit` job failed during `supabase start` on Inbucket's host port `54324` (already in use); this prevented Admin tests running. The same collision recurred in all three retries, so the retry loop alone is not a fix. Source: [job logs](https://github.com/gokulggovardhan/lumeo/actions/runs/42542616422/job/128920833058).
2. Corrective PR #693 branch commit `7b9c450704a95810fde68b9c954a8bfeb4ab2679` disables unused Inbucket in this isolated Admin job, matching the existing catalog Workspace CI pattern. **Retest must pass before merge; no result is pre-certified.** This does not change the production Supabase project.
3. Main SHA `552062f` CodeQL Actions-language analysis failed at download time because GitHub's CodeQL bundle URL returned HTTP 504. JavaScript/TypeScript and Python CodeQL jobs passed. This was a tool download failure, **not evidence of successful CodeQL analysis**. Source: [run](https://github.com/gokulggovardhan/lumeo/actions/runs/42582765071). A targeted job rerun was rejected by GitHub with HTTP 403; this remains an independent verification blocker until a successful run.
4. At inspection, current-main full Lumeo CI, Mobile Lighthouse, and post-deployment browser-operation certification were still in progress. Do not promote pending checks to PASS.
5. PR #696 had failures in the core build/release gate. Keep unrelated dependency upgrades isolated and do not force-merge. PR #695 is autogenerated Graphify maintenance, not an implicit Phase 0 requirement.
6. External read-only page retrieval from the audit runtime did not directly render the live PDF UI. GitHub's production health and deployment evidence are distinct, observable checks; they must not substitute for a clean actual browser processing run.

## Phase 0 acceptance gate

Phase 0 is **not closed** in this snapshot. Close only after:

- The synthetic benchmark/doc/fix changes land through a passing protected PR with review requirements honored.
- Any in-scope CI failures are resolved and the accepted main revision passes all required checks.
- The exact final deployed `main` SHA is confirmed, including actual Merge + Compress output/download on production across the required browser suite.
- Remaining limitations/gaps for Phases 1–16 are recorded honestly; no quality or performance claim exceeds its evidence.
- No existing Workspace functionality is regressed.

**Next development phase:** Phase 1 only after every Phase 0 gate above is positively evidenced. Until then, remain on Phase 0.
