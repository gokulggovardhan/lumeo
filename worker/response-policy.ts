const PRODUCTION_HOSTS = new Set(["lumeo.in", "www.lumeo.in"]);

export function isProductionRequest(request: Request): boolean {
  return PRODUCTION_HOSTS.has(new URL(request.url).hostname.toLowerCase());
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

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
