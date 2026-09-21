# Browser Office runtime asset delivery

Lumeo's browser Office engine must **not** ship the LibreOffice/ZetaOffice
runtime inside the ordinary Next/Cloudflare application bundle. The runtime is
large, changes independently from the UI, and should be cached independently.

## Production layout

Production uses one immutable release directory on a dedicated static origin,
preferably Cloudflare R2 behind `assets.lumeo.in`:

```
https://assets.lumeo.in/office/zeta-24-2/<release-id>/
```

Set the application build variable to that exact release:

```
NEXT_PUBLIC_LUMEO_OFFICE_ASSET_BASE_URL=https://assets.lumeo.in/office/zeta-24-2/<release-id>/
```

The production resolver rejects mutable `latest` paths. It derives the release
ID from the final path segment and requires a matching
`lumeo-office-runtime.json` manifest before LibreOffice is started.

## Runtime release contents

Every release contains:

- `soffice.js`
- `soffice.wasm`
- `soffice.data`
- `soffice.data.js.metadata`
- `lumeo-office-runtime.json`

The manifest records:

- manifest schema version
- immutable release ID
- pinned ZetaJS helper version
- ZetaOffice source branch
- creation timestamp
- byte size, SHA-256 and content type for each required runtime file

The browser preflight rejects a release when the release ID, pinned helper
version, required file inventory, reported content type or readable object size
does not match. Transient network failures are retried briefly; there is no
server-conversion fallback.

The manifest's SHA-256 values are release/publishing integrity metadata. The
browser does not re-download the full ~250 MB payload just to hash it before
LibreOffice starts; runtime initialization remains the final executable-integrity
check.

## Reproducible snapshot

Prepare an immutable release from the upstream ZetaOffice CDN without publishing:

```bash
node scripts/prepare-office-runtime-release.mjs \
  --release zeta-2026-09-21-a \
  --source https://cdn.zetaoffice.net/zetaoffice_latest/ \
  --out .runtime/office
```

The preparation script refuses to overwrite an existing release directory,
streams each large object to disk, records its SHA-256, and writes the manifest.

GitHub Actions also provides the manually triggered
`Office Runtime Release` workflow. With `publish=false`, it performs a dry
run only. With `publish=true`, it publishes the immutable release to R2 and
uploads the manifest last so an incomplete release can never look published.

Publishing requires:

- repository secret `CLOUDFLARE_API_TOKEN`
- repository secret `CLOUDFLARE_ACCOUNT_ID`
- repository variable `LUMEO_OFFICE_R2_BUCKET`
- a public R2 custom domain matching the workflow's `asset_origin` input

The workflow deliberately fails instead of falling back to Render, Supabase, or
another conversion service when this infrastructure is missing.

## R2 CORS and response behavior

`config/office-runtime-r2-cors.json` is the canonical CORS policy for the
runtime bucket. The release workflow applies it before publishing.

The public asset origin must provide:

- HTTPS
- CORS access from `https://lumeo.in`
- GET/HEAD and single-range requests
- exposed range/cache headers used by runtime verification
- `Cross-Origin-Resource-Policy: cross-origin` when required by the serving layer
- byte-range support for the large runtime payload
- correct JavaScript/WebAssembly/data MIME types
- correct `Content-Encoding` if objects are compressed in transit
- long-lived immutable caching

Versioned objects use:

```
Cache-Control: public, max-age=31536000, immutable
```

Do not overwrite an existing release path. Publish a new release directory and
change the Lumeo production build variable only after the new runtime passes the
conversion corpus.

Cloudflare R2 custom domains emit CORS headers only for matching cross-origin
requests, so production verification sends
`Origin: https://lumeo.in`. CORS and CORP are separate policies: the bucket
CORS configuration does not by itself create
`Cross-Origin-Resource-Policy: cross-origin`. The `assets.lumeo.in` serving
layer must add that response header (for example with a Cloudflare response
header transform or a dedicated asset Worker). The browser preflight and the
publish workflow both reject a cross-origin production release when that header
is missing. After changing an already-cached CORS or response-header policy,
purge the runtime hostname cache before relying on old cached objects.

## Development

The internal development lab may use the upstream
`https://cdn.zetaoffice.net/zetaoffice_latest/` endpoint for compatibility
research. Development performs a lightweight `soffice.js` reachability probe
and does not require a Lumeo manifest.

Public production conversion must never depend on the mutable upstream
`latest` alias.

## Deployment rule

The large Office payload is deployed separately from the application. Normal
Next builds, Cloudflare Worker bundles, public routes, and admin routes must
remain functional even if the Office asset origin is unavailable.

The conversion engine performs the runtime preflight lazily when a user starts
Word → PDF. If the release is unavailable, incomplete, mismatched, or cannot
initialize, the UI must show a clear local-runtime error. It must not silently
route the document to any server-side conversion path.
