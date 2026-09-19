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
