/**
 * Bounded, versioned edge cache for audited PUBLIC HTML entry pages only.
 *
 * Private APIs, Admin, RSC/Flight, requests with auth headers, cookies
 * identifying a login, non-GET, and query-string requests are never cached.
 * A cached HTML body cannot contain a private file or a document session:
 * Workspace files remain browser-only in the client document provider.
 *
 * This reduces repeated server-side render CPU on the Workers Free plan.
 */
const PUBLIC_PATHS = new Set([
  "/",
  "/pdf",
  "/pdf-tools",
  "/pdf/edit",
  "/pdf/pdf-to-word",
]);

export const PUBLIC_HTML_EDGE_TTL_SECONDS = 180;

const PRIVATE_COOKIE_NAME = /(?:^|;\s*)(?:sb-[^=;]+|__session|auth-token|next-auth\.session-token)=/i;

export function publicHtmlCacheKey(
  request: Request,
  buildSha: string,
): Request | null {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  if (url.protocol !== "https:" || url.hostname !== "lumeo.in") return null;
  if (!PUBLIC_PATHS.has(url.pathname) || url.search) return null;
  if (
    request.headers.has("authorization") ||
    request.headers.has("rsc") ||
    request.headers.has("next-router-state-tree") ||
    request.headers.has("next-router-prefetch") ||
    request.headers.has("next-router-segment-prefetch") ||
    request.headers.has("x-middleware-prefetch") ||
    request.headers.get("purpose")?.includes("prefetch") ||
    request.headers.get("cache-control")?.includes("no-cache") ||
    request.headers.get("accept")?.includes("application/json") ||
    PRIVATE_COOKIE_NAME.test(request.headers.get("cookie") ?? "")
  ) {
    return null;
  }

  // A release-specific cache identity prevents cross-version HTML/JS mixes.
  const releaseId = /^[0-9a-f]{40}$/i.test(buildSha) ? buildSha : "local";
  const internalUrl = new URL(
    `/__lumeo_edge_public_html/${releaseId}${url.pathname}`,
    url.origin,
  );
  return new Request(internalUrl, { method: "GET" });
}

export function mayCachePublicHtml(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return (
    response.status === 200 &&
    contentType.toLowerCase().includes("text/html") &&
    !response.headers.has("set-cookie") &&
    response.headers.get("vary")?.trim() !== "*"
  );
}

export function publicHtmlCacheStorageCopy(response: Response): Response {
  const headers = new Headers(response.headers);
  // Only this INTERNAL cache copy gets a public TTL. The response sent to
  // visitors retains private/no-store browser cache semantics.
  headers.set("Cache-Control", `public, max-age=${PUBLIC_HTML_EDGE_TTL_SECONDS}`);
  return new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function publicHtmlCacheBrowserCopy(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
