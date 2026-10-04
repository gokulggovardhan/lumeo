import { pathToFileURL } from "node:url";

const HYBRID_HOMEPAGE_MARKERS = [
  "Start PDF Workspace",
  "Explore PDF tools",
  "Use one focused tool for a quick task, or upload once into PDF Workspace",
];

function fail(message) {
  throw new Error(message);
}

export function assertDocumentCacheIsReleaseSafe(headers, pathname) {
  const cacheControl = (headers.get("cache-control") ?? "").toLowerCase();
  const cloudflareCacheStatus = (headers.get("cf-cache-status") ?? "").toLowerCase();

  if (cacheControl.includes("immutable")) {
    fail(`${pathname} document response must not be immutable`);
  }

  const isPublic = /(?:^|,)\s*public(?:\s|,|$)/.test(cacheControl);
  const positiveSharedTtl = [...cacheControl.matchAll(/(?:s-maxage|max-age)\s*=\s*(\d+)/g)]
    .some((match) => Number(match[1]) > 0);

  if (isPublic && positiveSharedTtl) {
    fail(`${pathname} document response must not use a positive public cache TTL`);
  }

  if (cloudflareCacheStatus === "hit") {
    fail(`${pathname} document response must not be served from the Cloudflare cache`);
  }
}

export function assertHashedAssetIsImmutable(headers, assetUrl) {
  const cacheControl = (headers.get("cache-control") ?? "").toLowerCase();
  const maxAge = Number(cacheControl.match(/max-age\s*=\s*(\d+)/)?.[1] ?? 0);

  if (!cacheControl.includes("public") || !cacheControl.includes("immutable") || maxAge < 31_536_000) {
    fail(`${assetUrl} must keep public one-year immutable caching`);
  }
}

async function fetchOrFail(fetchImpl, url, init = {}) {
  const response = await fetchImpl(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
    ...init,
  });

  if (response.status !== 200) {
    const location = response.headers.get("location");
    fail(`${new URL(url).pathname} returned HTTP ${response.status}${location ? ` (Location: ${location})` : ""}`);
  }

  return response;
}

/**
 * @param {{
 *   baseUrl?: string,
 *   expectedSha?: string,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 */
export async function verifyProductionFreshness({
  baseUrl = "https://lumeo.in",
  expectedSha,
  fetchImpl = fetch,
} = {}) {
  if (!/^[0-9a-f]{40}$/i.test(expectedSha ?? "")) {
    fail("EXPECTED_SHA must be the exact 40-character production commit SHA");
  }

  const origin = new URL(baseUrl);
  const homepageResponse = await fetchOrFail(fetchImpl, new URL("/", origin));
  assertDocumentCacheIsReleaseSafe(homepageResponse.headers, "/");
  const homepageHtml = await homepageResponse.text();

  for (const marker of HYBRID_HOMEPAGE_MARKERS) {
    if (!homepageHtml.includes(marker)) {
      fail(`Homepage raw HTML is missing current hybrid marker: ${marker}`);
    }
  }

  const workspaceResponse = await fetchOrFail(fetchImpl, new URL("/pdf", origin));
  assertDocumentCacheIsReleaseSafe(workspaceResponse.headers, "/pdf");
  const workspaceHtml = await workspaceResponse.text();
  if (!workspaceHtml.includes("PDF Workspace") || !workspaceHtml.includes("Upload one PDF")) {
    fail("/pdf raw HTML does not contain the real Workspace entry");
  }

  const toolsResponse = await fetchOrFail(fetchImpl, new URL("/pdf-tools", origin));
  assertDocumentCacheIsReleaseSafe(toolsResponse.headers, "/pdf-tools");

  const buildInfoResponse = await fetchOrFail(fetchImpl, new URL("/api/build-info", origin));
  const buildInfo = await buildInfoResponse.json();
  if (buildInfo.commit !== expectedSha || buildInfo.environment !== "production") {
    fail(
      `/api/build-info mismatch: expected ${expectedSha} (production), observed ${buildInfo.commit ?? "none"} (${buildInfo.environment ?? "unknown"})`,
    );
  }

  const assetPath = homepageHtml.match(
    /<script[^>]+src=["']([^"']*\/_next\/static\/[^"']+\.js(?:\?[^"']*)?)["']/i,
  )?.[1];
  if (!assetPath) {
    fail("Homepage raw HTML did not expose a hashed JavaScript asset");
  }

  const assetUrl = new URL(assetPath, origin);
  const assetResponse = await fetchOrFail(fetchImpl, assetUrl, { method: "HEAD" });
  assertHashedAssetIsImmutable(assetResponse.headers, assetUrl.pathname);

  return {
    commit: buildInfo.commit,
    homepageMarkers: HYBRID_HOMEPAGE_MARKERS.length,
    immutableAsset: assetUrl.pathname,
  };
}

async function main() {
  const result = await verifyProductionFreshness({
    baseUrl: process.env.LUMEO_PRODUCTION_URL || "https://lumeo.in",
    expectedSha: process.env.EXPECTED_SHA,
  });

  console.log(`PASS raw homepage contains ${result.homepageMarkers} current hybrid markers`);
  console.log("PASS /pdf is a direct HTTP 200 Workspace entry");
  console.log("PASS document responses are not served from a positive public edge cache");
  console.log(`PASS ${result.immutableAsset} keeps immutable asset caching`);
  console.log(`PASS /api/build-info revision ${result.commit} (production)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
