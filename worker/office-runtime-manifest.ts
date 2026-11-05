import runtimeRelease from "../config/office-runtime-release.json" with { type: "json" };
import pinnedManifest from "../config/office-runtime-manifest.json" with { type: "json" };

// Exact published GitHub Release manifest, pinned and verified at build time.
// Unlike the 260 MB Office binary payloads, this 1.6 KB manifest is safe to
// bundle with the Worker and eliminates a GitHub redirect/subrequest for the
// very first conversion preflight. Do not embed the large WASM/data files.
const manifestJson = JSON.stringify(pinnedManifest);
const manifestBytes = new TextEncoder().encode(manifestJson).byteLength;

export function servePinnedOfficeRuntimeManifest(request: Request): Response {
  if (pinnedManifest.releaseId !== runtimeRelease.releaseId) {
    return new Response("Office runtime release manifest mismatch.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Immutable, versioned, public metadata only. Document content, filenames,
  // user data, and Supabase credentials are never sent to this endpoint.
  const headers = new Headers({
    "Content-Type": "application/json",
    "Content-Length": String(manifestBytes),
    "Cache-Control": "public, max-age=31536000, immutable, no-transform",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000",
  });
  return new Response(request.method === "HEAD" ? null : manifestJson, {
    status: 200,
    headers,
  });
}
