# Browser converter capability record

The public `/heic-to-jpeg` workspace reuses Phase 0 basename normalization, bounded HEIF structure parsing, and safe AAE XML inspection. The CLI entry points retain Node filesystem access; browser code imports the pure modules directly, never the CLI barrel.

## Decoder and output

`libheif-js` 1.23.2 provides a bundled browser WASM decoder in a module worker. It selects the explicitly primary top-level image, decodes RGBA using the decoder's actual channel dimensions, and lets libheif apply HEIF container transforms. EXIF orientation is a fallback only without observed container rotation/mirroring. OffscreenCanvas encodes JPEG at quality 85, 92 or 96. The JPEG signature is checked before success. Metadata, including GPS, is omitted. No conversion file is sent to an API.

Gain-map HEICs use the available base still; auxiliary gain maps and depth are not reconstructed. HDR-only PQ/HLG transfer functions are rejected rather than mislabelled as correctly tone-mapped output. Wide-gamut/ICC parity with Apple Photos is unverified; an sRGB canvas does not by itself prove source color-profile conversion. AAE metadata never causes transformations, or a claim that edits are baked. Filename-only Live Photo pairing is probable, not authoritative. Duplicate stills stay separate, ambiguous companions remain review items.


## Full-resolution invariant

JPEG quality controls compression only; the converter has no implicit resize path. The worker records the libheif primary-image dimensions, decoded RGBA dimensions, and final export-canvas dimensions so unexpected geometry changes are visible in the result details and testable without trusting React state alone. It also refuses to emit a JPEG if decoding or export changes the pixel geometry (apart from an orientation width/height swap), so a future decoder regression fails explicitly instead of silently downscaling.

The HEIC release gate generates a non-private 6048x8064 HEIC whose embedded thumbnail is exactly 1152x1536. Chromium, WebKit and Firefox must export the 6048x8064 primary image, and the test parses the downloaded JPEG bytes to confirm their intrinsic dimensions. Chromium also checks quality 85, 92, and 96 against the same source and verifies batch/ZIP output stays full resolution. The same gate builds the vinext/Cloudflare Worker and performs a deployment dry-run. This specifically prevents a future refactor from exporting the embedded thumbnail or breaking the production Worker bundle.


## Decoder security containment

The browser converter currently uses `libheif-js 1.23.2`, whose Emscripten artifact embeds upstream libheif 1.23.2. The wrapper build enables libde265, disables WebCodecs and the uncompressed codec by default, disables libheif multithreading, and runs inside Lumeo's fresh per-file Web Worker.

The packaged Emscripten build enables libde265 but disables the uncompressed codec and WebCodecs, and libheif multithreading is off. That makes the current uncompressed-codec and WebCodecs advisories outside this artifact's compiled feature set, while parser-level item/reference issues and single-thread decode-reference cycles remain relevant.

Until an official wrapper containing upstream libheif 1.23.4 or newer is available, Lumeo performs a bounded ISO-BMFF preflight before entering WASM. The preflight mirrors libheif's default `max_items=1000` ceiling for declared `iinf` items, total `iref` entries, and targets per reference entry; it also rejects malformed reference counts and cyclic `dimg`/`auxl` decode graphs. A generous total-reference budget prevents the JavaScript preflight itself from becoming an allocation-amplification path.

Structurally partial/over-complex containers and declared primary dimensions outside Lumeo's existing 64 MP limit are rejected before the WASM parser. These controls reduce exposure to the parser-amplification and reference-cycle advisories fixed upstream after 1.23.2, but they are containment rather than a substitute for a patched libheif build.

## Resources

One worker on smaller devices, at most two on higher-core desktops. Each job gets a fresh WASM heap which is destroyed on completion, error, cancellation or a two-minute timeout. Encoded JPEGs remain until reset/unmount; 500-file memory suitability is not certified. A 128 MiB source/64 megapixel decode guard protects the browser from very large individual allocations. ZIP uses the existing JSZip with STORE compression. Smaller batches are recommended for high-resolution photos.

## Validation boundary

The production converter is release-gated with deterministic browser fixtures and live-production smoke rather than private photo samples. Automated coverage includes Chromium, WebKit and Firefox conversion; 6048x8064 primary-image preservation against an embedded 1152x1536 thumbnail; corrupt-file isolation and valid-after-corrupt recovery; malicious HEIF preflight rejection; ZIP dimension preservation; narrow mobile layout; cancellation/reset behavior; and Cloudflare/vinext bundle validation.

No claim is made that Lumeo exactly reproduces Apple Photos rendering for every real iPhone Portrait, HDR/gain-map, wide-gamut ICC, Live Photo or AAE-edited asset. Those Apple-specific visual-parity checks remain an optional compatibility investigation for unsupported or explicitly disclosed metadata/rendering features, not an unfinished release blocker for the current browser converter. The converter must continue to reject or disclose unsupported cases rather than inventing parity.

Analytics uses existing approved tool_opened, processing_started/succeeded/failed and download_started events only. Browser conversion is independent of analytics.

## Real-sample harness

Keep private exports under ignored `/samples`. Start the built or development app on port 3000, then run `npm run verify:heic-samples -- samples/<set>`. The harness performs the Phase 0 structural inspection, processes the same files through Chromium without uploading them, and writes ignored `inspector-output/report.json` plus `inspector-output/conversion-report.json`. Compare those results and downloaded JPEG appearance manually against Apple Photos; the harness does not certify visual parity.

Decoder source/license: https://github.com/catdad-experiments/libheif-js (LGPL-3.0); underlying libheif: https://github.com/strukturag/libheif. Distribution must retain license notices and corresponding source availability. The dependency is unmodified and pinned in the lockfile.
