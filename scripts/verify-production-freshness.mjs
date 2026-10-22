import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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

// Only public response metadata is recorded; never cookies, bodies or query strings.
const SAFE_HEADERS = ["date", "cache-control", "cf-cache-status", "cf-ray", "content-type", "server", "strict-transport-security"];

async function fetchOrFail(fetchImpl, url, init = {}, evidence = [], expectedStatus = 200) {
  const item = { path: new URL(url).pathname, method: init.method ?? "GET", timestamp: new Date().toISOString() };
  evidence.push(item);
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
      ...init,
    });
  } catch (error) {
    // Error messages may contain credentials or proxy URLs. Record only a code.
    item.networkError = String(error?.cause?.code ?? error?.code ?? error?.name ?? "NETWORK_ERROR").replace(/[^A-Za-z0-9_]/g, "").slice(0, 80);
    fail(`${item.path} connection failed (${item.networkError}); no production HTTP response was obtained`);
  }
  item.status = response.status;
  item.headers = Object.fromEntries(SAFE_HEADERS.map(name => [name, response.headers.get(name)]).filter(([, value]) => value !== null));
  if (response.status !== expectedStatus) {
    const location = response.headers.get("location");
    const safeLocation = location ? new URL(location, url).pathname : null;
    fail(`${item.path} returned HTTP ${response.status}${safeLocation ? ` (Location: ${safeLocation})` : ""}`);
  }
  return response;
}

export function assertBuildInfoIsUncached(headers) {
  assertDocumentCacheIsReleaseSafe(headers, "/api/build-info");
  if (!/(?:^|,)\s*no-store(?:\s|,|$)/i.test(headers.get("cache-control") ?? "")) {
    fail("/api/build-info must use no-store caching");
  }
}

/**
 * @param {{
 *   baseUrl?: string,
 *   expectedSha?: string,
 *   fetchImpl?: typeof fetch,
 *   evidence?: Array<object>,
 * }} [options]
 */
export async function verifyProductionFreshness({
  baseUrl = "https://lumeo.in",
  expectedSha,
  fetchImpl = fetch,
  evidence = [],
} = {}) {
  if (!/^[0-9a-f]{40}$/i.test(expectedSha ?? "")) {
    fail("EXPECTED_SHA must be the exact 40-character production commit SHA");
  }

  const origin = new URL(baseUrl);
  const homepageResponse = await fetchOrFail(fetchImpl, new URL("/", origin), {}, evidence);
  assertDocumentCacheIsReleaseSafe(homepageResponse.headers, "/");
  const homepageHtml = await homepageResponse.text();

  for (const marker of HYBRID_HOMEPAGE_MARKERS) {
    if (!homepageHtml.includes(marker)) {
      fail(`Homepage raw HTML is missing current hybrid marker: ${marker}`);
    }
  }

  const workspaceResponse = await fetchOrFail(fetchImpl, new URL("/pdf", origin), {}, evidence);
  assertDocumentCacheIsReleaseSafe(workspaceResponse.headers, "/pdf");
  const workspaceHtml = await workspaceResponse.text();
  if (!workspaceHtml.includes("PDF Workspace") || !workspaceHtml.includes("Upload one PDF")) {
    fail("/pdf raw HTML does not contain the real Workspace entry");
  }

  const toolsResponse = await fetchOrFail(fetchImpl, new URL("/pdf-tools", origin), {}, evidence);
  assertDocumentCacheIsReleaseSafe(toolsResponse.headers, "/pdf-tools");

  const buildInfoResponse = await fetchOrFail(fetchImpl, new URL("/api/build-info", origin), {}, evidence);
  assertBuildInfoIsUncached(buildInfoResponse.headers);
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
  const assetResponse = await fetchOrFail(fetchImpl, assetUrl, { method: "HEAD" }, evidence);
  assertHashedAssetIsImmutable(assetResponse.headers, assetUrl.pathname);

  const missingResponse = await fetchOrFail(fetchImpl, new URL("/phase11-this-route-does-not-exist", origin), {}, evidence, 404);
  assertDocumentCacheIsReleaseSafe(missingResponse.headers, "/phase11-this-route-does-not-exist");
  const missingHtml = await missingResponse.text();
  for (const marker of ["This page is not here.", 'href="/"', 'href="/pdf"', 'href="/pdf-tools"']) {
    if (!missingHtml.includes(marker)) fail(`404 recovery is missing ${marker}`);
  }
  // Prevent a deployment change during the checks from producing a false pass.
  const finalResponse = await fetchOrFail(fetchImpl, new URL("/api/build-info", origin), {}, evidence);
  assertBuildInfoIsUncached(finalResponse.headers);
  const finalBuild = await finalResponse.json();
  if (finalBuild.commit !== expectedSha || finalBuild.environment !== "production") {
    fail("Production revision changed during verification");
  }

  return {
    commit: buildInfo.commit,
    evidence,
    homepageMarkers: HYBRID_HOMEPAGE_MARKERS.length,
    immutableAsset: assetUrl.pathname,
  };
}

async function main() {
  const evidence = [];
  const report = { startedAt: new Date().toISOString(), expectedSha: process.env.EXPECTED_SHA ?? null, status: "FAIL", evidence };
  try {
    const result = await verifyProductionFreshness({
      baseUrl: process.env.LUMEO_PRODUCTION_URL || "https://lumeo.in",
      expectedSha: process.env.EXPECTED_SHA,
      evidence,
    });
    Object.assign(report, result, { status: "PASS" });
    console.log(`PASS production routes, 404 recovery, safe document caching and immutable assets at ${result.commit}`);
  } catch (error) {
    report.error = error instanceof Error ? error.message : "Verification failed";
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    const reportPath = process.env.LUMEO_FRESHNESS_REPORT || "test-results/production-freshness.json";
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
