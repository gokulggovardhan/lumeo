# Lumeo Merge/Compress — Phase 2 shared processing architecture

**Evidence candidate:** protected main `a36e478c3567f9ae92354e2864d46f1d034bd0b7` plus this Phase 2 branch. This document is **not** a release certificate until PR checks, deployment and production browser operations pass.

## Architecture and source-of-truth paths

| Layer | Native Merge PDF | Shared Compression PDF |
|---|---|---|
| Standalone UI | `components/pdf/MergePdfTool.tsx` | `components/pdf/CompressPdfTool.tsx` |
| Browser job client | `lib/pdf/merge/mergeWorkerClient.ts` | `lib/pdf/optimization/compressionWorkerClient.ts` |
| Dedicated module Worker | `lib/pdf/merge/nativeMerge.worker.ts` | `lib/pdf/optimization/compression.worker.ts` |
| Core algorithm | `lib/pdf/merge/nativeMerge.ts` | `lib/pdf/optimization/compressionPipeline.ts` |
| Shared validation | `lib/pdf/optimization/validateOutput.ts` | The same `validatePdfOutput.ts` |
| Reusable resources | Page placement, rotation and `pdf-lib` native copying | `nativeImages.ts`, `nativeJpegCodec.ts`, `adaptiveTarget.ts`, `fidelity.ts` |

The optional **Merge → Compress** flow calls the same `compressPdfInBackground` pipeline as standalone Compress PDF; the original-quality native merge remains the default. No source PDF is uploaded to a new server endpoint. On successful output, the serialized result is validated against the expected page count before it is offered for download.

## Message, ownership and cancellation contracts

- The Worker message types are `progress`, `result`, `error`. Success transfers the result `ArrayBuffer` back. Worker crashes, postMessage transfer errors and a four-minute operation timeout fail closed; successful completion, error, cancellation and timeout terminate the Worker and release listeners.
- Merge UI reads fresh `File.arrayBuffer()` inputs for each job; `mergeWorkerClient` transfers those **per-operation** buffers into the Worker. Consumers must not reuse the detached inputs after submission. The File objects remain available for a fresh attempt. Compression explicitly copies its caller's `ArrayBuffer` before transfer to avoid detaching an input held by the Workspace.
- Cancellation on browser Worker paths terminates the Worker. On browsers lacking Worker, native Merge retains its existing synchronous fallback, which cannot preempt a currently executing synchronous PDF library call; it now honors the caller's AbortSignal at load, page and output boundaries and refuses to return a result after cancellation. Compress already fails clearly when Worker is unsupported.
- Aborted and corrupt/unsafe documents never result in a purported successful downloadable PDF. Failed or unsupported optional compression returns the original-sized safe output or an explicit error rather than misleading size savings.

## Existing device safety boundaries

- Native Merge: combined input `<=128 MiB`, `<=600` pages; rejects unsafe interactive forms, outlines, annotations and signatures rather than silently dropping them. It retains native text/fonts and page content without rasterizing them.
- Native Compression: `<=80 MiB` input, `<=600` pages and `<=256` independent JPEG resources, with strict image eligibility and fidelity gates in `nativeImages.ts`. A target-size claim is based on serialized output bytes, not intended settings.
- Both paths do local document processing. Existing public availability/telemetry control planes must never be interpreted as authorization to send PDF contents to a server.

## Phase 2 targeted correction and verification

The original fallback path called `mergeNativeDocuments(inputs, { ...options, onProgress })` without the `AbortSignal`. This could allow a user-cancelled Worker-less merge to continue to an output. Phase 2 forwards `signal` and adds `assertMergeActive()` checks before/between loads, pages, serialization and final validation. The normal Worker transfer path, page fidelity, compression engine, UI and device limits are unchanged.

Regression tests:
- `tests/pdf-native-merge.test.ts`: pre-aborted merge and cancellation triggered after first progress update must reject with `AbortError` and never proceed to the next output page.
- `tests/pdf-shared-compression-integration.test.ts`: architectural contract asserts signal forwarding and shared compressor, original-quality default and safe output guard.
- Existing `tests/pdf-shared-output-guard.test.ts`, `tests/pdf-native-resource-optimization.test.ts`, `tests/pdf-adaptive-target-search.test.ts`, `e2e/workspace-mobile.spec.ts`: separate structure, exact-byte, worker, browser and document safety evidence.

**Acceptance gates:** protected CI, typecheck/lint/unit/browser regressions, a mergeable PR, safe protected merge and exact-deployed-SHA real Merge/Compress processing. Record results in [issue #698](https://github.com/gokulggovardhan/lumeo/issues/698) after confirmation, not before.

**Deliberately reserved later acceptance:** complex PDF structure classification (Phase 3), exhaustive output fidelity (Phases 4–7,12), full mobile memory/worker pressure and mid-call sync fallback limits (Phase 11), real-document and cross-browser performance corpus (Phase 13), and final release certificate (Phase 16). These are not claimed as already tested by the Phase 2 contract.
