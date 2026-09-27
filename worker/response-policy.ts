const PRODUCTION_HOSTS = new Set(["lumeo.in", "www.lumeo.in"]);

function requiresCrossOriginIsolation(request: Request): boolean {
  const pathname = new URL(request.url).pathname;
  return (
    pathname === "/pdf/word-to-pdf" ||
    pathname.startsWith("/pdf/word-to-pdf/")
  );
}

export function isProductionRequest(request: Request): boolean {
  return PRODUCTION_HOSTS.has(new URL(request.url).hostname.toLowerCase());
}

function isReactServerComponentResponse(
  request: Request,
  response: Response,
): boolean {
  if (request.headers.get("rsc") === "1") return true;
  return response.headers
    .get("content-type")
    ?.toLowerCase()
    .includes("text/x-component") ?? false;
}

function appendVary(headers: Headers, values: string[]): void {
  const current = (headers.get("vary") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const normalized = new Set(current.map((value) => value.toLowerCase()));

  for (const value of values) {
    if (!normalized.has(value.toLowerCase())) {
      current.push(value);
      normalized.add(value.toLowerCase());
    }
  }

  headers.set("Vary", current.join(", "));
}

export function withProductionSecurityHeaders(
  request: Request,
  response: Response,
): Response {
  if (!isProductionRequest(request)) return response;

  const headers = new Headers(response.headers);
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000");

  // React #412 in the current React line decodes to "Connection closed.".
  // Partial/stale RSC payloads must never be replayed across navigation
  // variants. Keep Flight responses private/no-store and preserve the routing
  // headers in Vary so an edge/cache layer cannot mix prefetch and navigation
  // payloads.
  if (isReactServerComponentResponse(request, response)) {
    headers.set(
      "Cache-Control",
      "private, no-store, max-age=0, must-revalidate",
    );
    appendVary(headers, [
      "RSC",
      "Next-Router-State-Tree",
      "Next-Router-Prefetch",
      "Next-Router-Segment-Prefetch",
    ]);
  }

  if (requiresCrossOriginIsolation(request)) {
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
