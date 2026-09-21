import runtimeRelease from "@/config/office-runtime-release.json";

const ALLOWED_RUNTIME_ASSETS = {
  "soffice.js": "application/javascript",
  "soffice.wasm": "application/wasm",
  "soffice.data": "application/octet-stream",
  "soffice.data.js.metadata": "application/json",
  "lumeo-office-runtime.json": "application/json",
} as const;

type RuntimeAssetName = keyof typeof ALLOWED_RUNTIME_ASSETS;

type RouteContext = {
  params: Promise<{
    release: string;
    asset: string;
  }>;
};

type CloudflareFetchInit = RequestInit & {
  cf?: {
    cacheEverything?: boolean;
    cacheTtl?: number;
  };
};

function runtimeSourceUrl(asset: RuntimeAssetName): string {
  return `https://github.com/gokulggovardhan/lumeo/releases/download/${runtimeRelease.releaseTag}/${asset}`;
}

function proxyHeaders(
  upstream: Response,
  asset: RuntimeAssetName,
): Headers {
  const headers = new Headers();

  headers.set("Content-Type", ALLOWED_RUNTIME_ASSETS[asset]);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("X-Content-Type-Options", "nosniff");

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

async function proxyRuntimeAsset(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { release, asset } = await context.params;

  if (
    release !== runtimeRelease.releaseId ||
    !(asset in ALLOWED_RUNTIME_ASSETS)
  ) {
    return new Response("Not found", { status: 404 });
  }

  const runtimeAsset = asset as RuntimeAssetName;
  const upstreamHeaders = new Headers();
  const range = request.headers.get("range");
  if (range) upstreamHeaders.set("Range", range);

  const init: CloudflareFetchInit = {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers: upstreamHeaders,
    redirect: "follow",
    cf: {
      cacheEverything: true,
      cacheTtl: 31_536_000,
    },
  };

  let upstream: Response;
  try {
    upstream = await fetch(runtimeSourceUrl(runtimeAsset), init);
  } catch {
    return new Response("Office runtime is temporarily unavailable.", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  if (!upstream.ok && upstream.status !== 206) {
    await upstream.body?.cancel().catch(() => {});
    return new Response("Office runtime is temporarily unavailable.", {
      status: upstream.status === 404 ? 503 : upstream.status,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  const headers = proxyHeaders(upstream, runtimeAsset);
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return proxyRuntimeAsset(request, context);
}

export async function HEAD(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return proxyRuntimeAsset(request, context);
}
