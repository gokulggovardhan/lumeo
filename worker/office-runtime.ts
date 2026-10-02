import runtimeRelease from "../config/office-runtime-release.json" with { type: "json" };

const OFFICE_RUNTIME_ROOT = "/office-runtime/";

const ALLOWED_RUNTIME_ASSETS = {
  "soffice.js": "application/javascript",
  "soffice.wasm": "application/wasm",
  "soffice.data": "application/octet-stream",
  "soffice.data.js.metadata": "application/json",
  "lumeo-office-runtime.json": "application/json",
} as const;

type RuntimeAssetName = keyof typeof ALLOWED_RUNTIME_ASSETS;

type CloudflareResponseInit = ResponseInit & {
  encodeBody?: "automatic" | "manual";
};

const UPSTREAM_RETRY_DELAYS_MS = [250, 1_000, 2_500] as const;

function isTransientUpstreamStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function waitForUpstreamRetry(
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw signal.reason ?? new Error("Request aborted.");

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Request aborted."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    setTimeout(() => signal.removeEventListener("abort", onAbort), delayMs + 1);
  });
}

async function fetchRuntimeSource(
  request: Request,
  asset: RuntimeAssetName,
  headers: Headers,
): Promise<Response> {
  let lastError: unknown;

  for (
    let attempt = 0;
    attempt <= UPSTREAM_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    if (request.signal.aborted) {
      throw request.signal.reason ?? new Error("Request aborted.");
    }

    try {
      const response = await fetch(runtimeSourceUrl(asset), {
        method: request.method,
        headers,
        redirect: "follow",
        cache: "no-store",
      });

      if (
        !isTransientUpstreamStatus(response.status) ||
        attempt === UPSTREAM_RETRY_DELAYS_MS.length
      ) {
        return response;
      }

      await response.body?.cancel().catch(() => {});
    } catch (error) {
      lastError = error;
      if (attempt === UPSTREAM_RETRY_DELAYS_MS.length) throw error;
    }

    await waitForUpstreamRetry(
      UPSTREAM_RETRY_DELAYS_MS[attempt] ?? 0,
      request.signal,
    );
  }

  throw lastError ?? new Error("Office runtime upstream request failed.");
}

function runtimeSourceUrl(asset: RuntimeAssetName): string {
  return `https://github.com/gokulggovardhan/lumeo/releases/download/${runtimeRelease.releaseTag}/${asset}`;
}

function runtimeResponseHeaders(
  upstream: Response,
  asset: RuntimeAssetName,
): Headers {
  const headers = new Headers();

  headers.set("Content-Type", ALLOWED_RUNTIME_ASSETS[asset]);
  headers.set(
    "Cache-Control",
    "public, max-age=31536000, immutable, no-transform",
  );
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000");

  for (const name of [
    "accept-ranges",
    "content-length",
    "content-range",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return headers;
}

function runtimeAssetFromPath(pathname: string): RuntimeAssetName | null {
  const prefix = `${OFFICE_RUNTIME_ROOT}${runtimeRelease.releaseId}/`;
  if (!pathname.startsWith(prefix)) return null;

  const asset = pathname.slice(prefix.length);
  if (!asset || asset.includes("/") || !(asset in ALLOWED_RUNTIME_ASSETS)) {
    return null;
  }

  return asset as RuntimeAssetName;
}

function runtimeError(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Handles immutable Office runtime assets before vinext.
 *
 * The runtime contains payloads larger than a Worker isolate's 128 MB memory
 * limit. Passing them through the application framework can cause buffering or
 * response transformation. This path performs only a streaming subrequest and
 * returns the upstream ReadableStream untouched.
 */
export async function maybeHandleOfficeRuntimeRequest(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (!url.pathname.startsWith(OFFICE_RUNTIME_ROOT)) return null;

  if (request.method !== "GET" && request.method !== "HEAD") {
    const response = runtimeError(405, "Method not allowed");
    response.headers.set("Allow", "GET, HEAD");
    return response;
  }

  const asset = runtimeAssetFromPath(url.pathname);
  if (!asset) return runtimeError(404, "Not found");

  const upstreamHeaders = new Headers({
    "Accept-Encoding": "identity",
  });
  const range = request.headers.get("range");
  if (range) upstreamHeaders.set("Range", range);

  let upstream: Response;
  try {
    upstream = await fetchRuntimeSource(request, asset, upstreamHeaders);
  } catch {
    return runtimeError(503, "Office runtime is temporarily unavailable.");
  }

  if (!upstream.ok && upstream.status !== 206) {
    await upstream.body?.cancel().catch(() => {});
    return runtimeError(
      upstream.status === 404 ? 503 : upstream.status,
      "Office runtime is temporarily unavailable.",
    );
  }

  const responseInit: CloudflareResponseInit = {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: runtimeResponseHeaders(upstream, asset),
    // The upstream request is identity-encoded and no response body is read.
    // Manual encoding plus Cache-Control: no-transform keeps the binary bytes
    // byte-for-byte identical instead of allowing edge recompression.
    encodeBody: "manual",
  };

  return new Response(
    request.method === "HEAD" ? null : upstream.body,
    responseInit,
  );
}
