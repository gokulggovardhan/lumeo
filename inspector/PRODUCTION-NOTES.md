# Browser converter capability record

The public `/heic-to-jpeg` workspace reuses Phase 0 basename normalization, bounded HEIF structure parsing, and safe AAE XML inspection. The CLI entry points retain Node filesystem access; browser code imports the pure modules directly, never the CLI barrel.

## Decoder and output

`libheif-js` 1.23.2 provides a bundled browser WASM decoder in a module worker. It selects the explicitly primary top-level image, decodes RGBA using the decoder's actual channel dimensions, and lets libheif apply HEIF container transforms. EXIF orientation is a fallback only without observed container rotation/mirroring. OffscreenCanvas encodes JPEG at quality 92 or 96. The JPEG signature is checked before success. Metadata, including GPS, is omitted. No conversion file is sent to an API.

Gain-map HEICs use the available base still; auxiliary gain maps and depth are not reconstructed. HDR-only PQ/HLG transfer functions are rejected rather than mislabelled as correctly tone-mapped output. Wide-gamut/ICC parity with Apple Photos is unverified; an sRGB canvas does not by itself prove source color-profile conversion. AAE metadata never causes transformations, or a claim that edits are baked. Filename-only Live Photo pairing is probable, not authoritative. Duplicate stills stay separate, ambiguous companions remain review items.


## Full-resolution invariant

JPEG quality controls compression only; the converter has no implicit resize path. The worker records the libheif primary-image dimensions, decoded RGBA dimensions, and final export-canvas dimensions so unexpected geometry changes are visible in the result details and testable without trusting React state alone. It also refuses to emit a JPEG if decoding or export changes the pixel geometry (apart from an orientation width/height swap), so a future decoder regression fails explicitly instead of silently downscaling.

The HEIC release gate generates a non-private 6048x8064 HEIC whose embedded thumbnail is exactly 1152x1536. Chromium and WebKit must export the 6048x8064 primary image, and the test parses the downloaded JPEG bytes to confirm their intrinsic dimensions. Chromium also checks quality 85, 92, and 96 against the same source and verifies batch/ZIP output stays full resolution. This specifically prevents a future refactor from exporting the embedded thumbnail.

## Resources

One worker on smaller devices, at most two on higher-core desktops. Each job gets a fresh WASM heap which is destroyed on completion, error, cancellation or a two-minute timeout. Encoded JPEGs remain until reset/unmount; 500-file memory suitability is not certified. A 128 MiB source/64 megapixel decode guard protects the browser from very large individual allocations. ZIP uses the existing JSZip with STORE compression. Smaller batches are recommended for high-resolution photos.

## Validation boundary

Synthetic grouping, primary selection, orientation matrices, cancellation, failure isolation and JPEG browser output can be tested automatically. No private real HEIC fixtures are committed. Real iPhone HEIC/Portrait/HDR/edited visual parity and physical iOS testing remain required. Phase 0's real-sample and human-reference gate remains BLOCKED until that evidence is available.

Analytics uses existing approved tool_opened, processing_started/succeeded/failed and download_started events only. The existing server RPC may reject an unknown tool slug until an active catalog row exists; no database policy or migration was changed here. Browser conversion is independent of analytics.

## Real-sample harness

Keep private exports under ignored `/samples`. Start the built or development app on port 3000, then run `npm run verify:heic-samples -- samples/<set>`. The harness performs the Phase 0 structural inspection, processes the same files through Chromium without uploading them, and writes ignored `inspector-output/report.json` plus `inspector-output/conversion-report.json`. Compare those results and downloaded JPEG appearance manually against Apple Photos; the harness does not certify visual parity.

Decoder source/license: https://github.com/catdad-experiments/libheif-js (LGPL-3.0); underlying libheif: https://github.com/strukturag/libheif. Distribution must retain license notices and corresponding source availability. The dependency is unmodified and pinned in the lockfile.
