const PRODUCTION_HOSTS = new Set(["lumeo.in", "www.lumeo.in"]);

const CROSS_ORIGIN_ISOLATED_PATH_PREFIXES = [
  "/dashboard/projects",
  "/internal/conversion-lab",
  "/internal/conversion-production-smoke",
  "/pdf/word-to-pdf",
] as const;

export function isProductionRequest(request: Request): boolean {
  return PRODUCTION_HOSTS.has(new URL(request.url).hostname.toLowerCase());
}

function requiresCrossOriginIsolation(request: Request): boolean {
  const { pathname } = new URL(request.url);
  return CROSS_ORIGIN_ISOLATED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
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
