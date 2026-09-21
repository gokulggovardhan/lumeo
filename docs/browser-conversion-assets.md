# Browser Office runtime asset delivery

Lumeo's browser Office engine does **not** bundle the LibreOffice/ZetaOffice
runtime into the ordinary Next/Cloudflare Worker bundle. The runtime is large,
versioned separately, and cached independently.

## Production architecture

The production browser loads one immutable Lumeo runtime path:

```
https://lumeo.in/office-runtime/<release-id>/
```

The path is implemented by the Cloudflare-deployed Lumeo application as a
streaming proxy to an immutable GitHub Release. User documents never pass
through this route; it serves only LibreOffice/ZetaOffice runtime binaries.

The authoritative release is defined in:

```
config/office-runtime-release.json
```

The default production runtime URL is resolved from the current Lumeo origin.
`NEXT_PUBLIC_LUMEO_OFFICE_ASSET_BASE_URL` remains available only as an
explicit override for a future dedicated static origin such as R2.

The production resolver rejects mutable `latest` paths and requires a matching
`lumeo-office-runtime.json` manifest before LibreOffice starts.

## Runtime release contents

Every immutable release contains:

- `soffice.js`
- `soffice.wasm`
- `soffice.data`
- `soffice.data.js.metadata`
- `lumeo-office-runtime.json`

The manifest records the immutable release ID, pinned ZetaJS version,
ZetaOffice source branch, creation timestamp, byte size, SHA-256, and content
type of each runtime file.

The browser preflight rejects missing, mismatched, incorrectly typed, or
non-immutable runtime responses. There is no Render, Supabase, or server
conversion fallback.

## Reproducible snapshot

The runtime snapshot is prepared by:

```bash
node scripts/prepare-office-runtime-release.mjs \
  --release <release-id> \
  --source https://cdn.zetaoffice.net/zetaoffice_latest/ \
  --out .runtime/office
```

The preparation script streams each large object to disk, calculates SHA-256,
writes the manifest, and refuses to overwrite an existing release directory.

## Automatic production publication

`.github/workflows/office-runtime-production.yml` runs when the runtime
configuration/delivery implementation lands on `main`.

It:

1. reads `config/office-runtime-release.json`
2. prepares the immutable runtime snapshot
3. validates all required files and manifest metadata
4. creates a **draft** GitHub Release
5. uploads the four runtime files
6. uploads the manifest last as the publish marker
7. verifies the release asset inventory and sizes
8. publishes the verified release
9. waits for the Cloudflare deployment
10. verifies the production Lumeo runtime route, MIME types, byte-range
   behavior, immutable caching, CORP header, and Cloudflare edge delivery

GitHub release assets may be up to 2 GiB, so the current LibreOffice payload
fits without putting large binaries into Git history or the Worker bundle.

## Cloudflare streaming route

`app/office-runtime/[release]/[asset]/route.ts` only permits the configured
release and five known asset names.

It forwards GET/HEAD and Range requests to the immutable release, streams the
upstream body instead of buffering it, and returns:

```
Cache-Control: public, max-age=31536000, immutable, no-transform
Cross-Origin-Resource-Policy: same-origin
X-Content-Type-Options: nosniff
```

with explicit JavaScript, WebAssembly, binary-data, and JSON MIME types.

Cloudflare Workers have no enforced response-body size limit and the standard
CDN cache object limit is above the current runtime object sizes, so the large
WASM/data files can remain streamed and cacheable without entering Worker
memory.

## Optional R2 delivery

The existing `Office Runtime Release` workflow and
`config/office-runtime-r2-cors.json` remain available as an optional future
optimization. If R2 credentials and a custom asset domain are configured,
`NEXT_PUBLIC_LUMEO_OFFICE_ASSET_BASE_URL` can point to that immutable release.

R2 is **not required** for the browser-only converters to launch.

## Development

The internal development lab may use the upstream mutable
`https://cdn.zetaoffice.net/zetaoffice_latest/` endpoint for compatibility
testing. Production never uses that mutable URL directly.

## Conversion privacy boundary

The Office runtime delivery path contains no document upload or conversion API.
Word → PDF runs inside the user's browser after the runtime loads. PDF → Word
also reconstructs locally in the browser.

If the runtime cannot initialize, the user receives a local-runtime error.
Lumeo never silently routes the document to the legacy server converter.
