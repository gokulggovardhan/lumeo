# Browser Office runtime asset delivery

Lumeo's browser Office engine must **not** ship the LibreOffice/ZetaOffice
runtime inside the ordinary Next/Cloudflare application bundle. The runtime is
large, changes independently from the UI, and should be cached independently.

## Production layout

Use a dedicated static origin, preferably a Cloudflare R2 bucket behind a
custom domain such as:

```
https://assets.lumeo.in/office/zeta-24-2/<release-id>/
```

Set the application build variable:

```
NEXT_PUBLIC_LUMEO_OFFICE_ASSET_BASE_URL=https://assets.lumeo.in/office/zeta-24-2/<release-id>/
```

The path must be immutable/versioned. The production resolver rejects URLs that
contain a `latest` alias.

## Required origin behavior

The asset origin should provide:

- HTTPS
- CORS access from `https://lumeo.in`
- `Cross-Origin-Resource-Policy: cross-origin` when served from a different origin
- long-lived immutable caching for versioned assets
- byte-range support for large binary assets where the origin supports it
- correct MIME types for JavaScript and WebAssembly

Recommended cache policy for immutable versioned objects:

```
Cache-Control: public, max-age=31536000, immutable
```

Do not overwrite an existing release path. Publish a new release directory and
change the Lumeo build variable only after the new runtime passes the conversion
corpus.

## Development

The internal development lab may use the upstream
`https://cdn.zetaoffice.net/zetaoffice_latest/` endpoint for compatibility
research. Public production conversion must not depend on that mutable alias.

## Deployment rule

The large Office payload is deployed separately from the application. Normal
Next builds, Cloudflare Worker bundles, public routes, and admin routes must
remain functional even if the Office asset origin is unavailable. The
conversion engine performs a lazy runtime preflight only when a user actually
starts Office conversion.
