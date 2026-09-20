# HEIC patched WASM evaluation

Status: **evaluation only — not a production decoder**.

## Why this exists

The production browser converter currently ships `libheif-js 1.23.2`. Its packaged Emscripten artifact embeds libheif 1.23.2 and libde265 1.0.15. Lumeo's #278 JavaScript/BMFF preflight remains mandatory defense in depth, but it cannot patch memory-safety defects inside the HEVC decoder.

The current upstream stable targets evaluated here are:

- libheif 1.23.4 — commit `4e14f5942c1732ace9611b9522cc991501445463`
- libde265 1.1.1 — commit `4dd701fffac01632ffd5cabc5ef10deb56accba1`
- Emscripten 3.1.61
- libheif-js 1.23.2 bundling layer — commit `6ca00b818c0ff51cb2a5c75b9ce97d708083335a`

A plain libheif 1.23.4 Emscripten build is not sufficient: its own build script still defaults to libde265 1.0.15. The candidate therefore builds libde265 separately and links that exact patched archive into libheif.

## Feature surface

The candidate intentionally keeps a small decode-only browser surface:

- libde265 HEVC decoding: enabled
- HEIF encoding: disabled
- plugin loading: disabled
- libheif multithreading: disabled
- WebCodecs integration: disabled
- uncompressed codec: disabled
- AV1/AOM/dav1d/rav1e: disabled
- x265/Kvazaar encoders: disabled
- JPEG/JPEG2000/OpenJPEG: disabled
- FFmpeg/OpenH264/VVC: disabled
- examples/documentation: disabled

The app-level #278 pre-WASM item/reference/cycle/dimension limits are not removed or relaxed.

## Reproducibility and provenance

`scripts/build-heic-wasm-candidate.sh` fetches exact Git commit SHAs, pins Emscripten, records tool versions, verifies the embedded numeric libheif/libde265 versions, and writes SHA-256 hashes for the generated artifacts.

The binary is **not committed**. CI uploads only short-lived evaluation evidence. Shipping a custom WASM artifact would require a separate reviewed distribution plan, durable source/provenance availability, and final LGPL compliance review.

## Acceptance gate

The candidate is not eligible for production unless it passes the existing HEIC matrix unchanged:

- canonical 6048×8064 primary + 1152×1536 thumbnail
- downloaded JPEG SOF dimensions remain 6048×8064
- quality 85/92/96 preserve geometry
- Chromium + WebKit
- valid + corrupt + valid batch isolation
- ZIP full-resolution verification
- #278 malicious fixtures
- orientation and primary-selection unit coverage
- TypeScript, focused lint, and production build

The comparison workflow runs the current official decoder first, swaps the candidate only inside CI's `node_modules`, and repeats the same browser suite. Production stays on the official decoder until the candidate proves safer and behaviorally equivalent.

## Licensing boundary

Both libheif and libde265 are LGPL-licensed libraries. This evaluation preserves their license files and does not ship the custom artifact to users. Before production distribution, confirm the obligations applicable to a statically linked/embedded WASM bundle, including notices, corresponding source/build scripts, and any required user relinking/replacement mechanism. That legal/distribution review is a release blocker, not an assumption.


## 2026-09-20 Cloudflare-era rerun

The pinned candidate build completed successfully on the Cloudflare-synchronized research branch.

- libheif: 1.23.4 at `4e14f5942c1732ace9611b9522cc991501445463`
- libde265: 1.1.1 at `4dd701fffac01632ffd5cabc5ef10deb56accba1`
- libheif-js bundling layer: 1.23.2 at `6ca00b818c0ff51cb2a5c75b9ce97d708083335a`
- Emscripten: 3.1.61
- Generated upstream npm lock: lockfile v3, 386 package entries
- Generated lock SHA-256: `e6fb3e2dab13f96e88f820628c6c908aa7731f00b3c733c2e00cde34628ba04d`

The research harness regenerates that lock from the fixed npm registry cutoff
`2026-09-19T00:00:00Z`, verifies the SHA-256 above, and only then runs
`npm ci --ignore-scripts`. A registry/dependency drift therefore fails before
the candidate is bundled.

### Evidence from the successful evaluation

| Metric | Current decoder | Candidate decoder | Result |
|---|---:|---:|---|
| Bundle JS bytes | 1,989,119 | 2,035,540 | Candidate +46,421 bytes (+2.33%) |
| Chromium q85 end-to-end | 1,777 ms | 1,393 ms | Candidate faster in this run |
| Chromium q92 end-to-end | 1,532 ms | 1,372 ms | Candidate faster in this run |
| Chromium q96 end-to-end | 1,430 ms | 1,468 ms | Essentially comparable; candidate slightly slower |
| WebKit q92 end-to-end | 2,376 ms | 2,246 ms | Candidate faster in this run |
| Full-resolution primary | 6048×8064 | 6048×8064 | PASS |
| Embedded thumbnail rejected as export source | 1152×1536 thumbnail present | 1152×1536 thumbnail present | PASS |
| Browser suite | 27 passed | 27 passed | PASS |
| HEIC unit/security suite | baseline PASS | candidate PASS | PASS |
| TypeScript / focused lint | baseline CI PASS | candidate PASS | PASS |
| Next production build | baseline CI PASS | candidate PASS | PASS |
| Cloudflare/vinext build | current architecture | candidate PASS | PASS |
| Cloudflare deployment dry-run | current architecture | candidate PASS | PASS |

The timing samples are single CI observations, not a statistically rigorous
performance benchmark. They are useful as regression evidence, not as a
performance guarantee.

Memory consumption was not promoted to a numeric comparison because the
browser/WASM heap is isolated inside Playwright browser processes and the
workflow does not yet expose a reliable apples-to-apples peak-heap metric.
Existing source-size, decoded-pixel, timeout, per-file isolation and worker
termination guards remain the primary resource-containment controls.
