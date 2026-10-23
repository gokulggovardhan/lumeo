import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifyProductionFreshness } from "../scripts/verify-production-freshness.mjs";

const sha = "82d1fd3c5df225b9753896de9c26a6b12dd2a74b";
const currentHomepage = `<!doctype html>
  <a href="/pdf">Start PDF Workspace</a>
  <a href="/pdf-tools">Explore PDF tools</a>
  <p>Use one focused tool for a quick task, or upload once into PDF Workspace</p>
  <script src="/_next/static/chunks/app-current.ABC123.js"></script>`;

test("production health waits for the exact deployment before checking document freshness", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/production-health.yml", import.meta.url),
    "utf8",
  );
  const deploymentCheck = workflow.indexOf("Verify deployed revision and Admin boundary");
  const freshnessCheck = workflow.indexOf("Verify production document freshness");

  assert.notEqual(deploymentCheck, -1);
  assert.notEqual(freshnessCheck, -1);
  assert.ok(
    deploymentCheck < freshnessCheck,
    "document freshness must run only after the bounded exact-SHA deployment wait",
  );
});

function response(body: BodyInit | null, init: ResponseInit = {}) {
  return new Response(body, { status: 200, ...init });
}

function productionFetch(overrides: Record<string, Response> = {}) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const key = `${init?.method ?? "GET"} ${url.pathname}`;
    if (overrides[key]) return overrides[key].clone();

    switch (key) {
      case "GET /":
        return response(currentHomepage, { headers: { "cache-control": "no-store, must-revalidate" } });
      case "GET /pdf":
        return response("<h1>PDF Workspace</h1><p>Upload one PDF</p>");
      case "GET /pdf-tools":
        return response("<h1>All PDF tools</h1>", { headers: { "cache-control": "no-cache" } });
      case "GET /api/build-info":
        return Response.json({ commit: sha, environment: "production" }, { headers: { "cache-control": "no-store" } });
      case "GET /phase11-this-route-does-not-exist":
        return response('<h1>This page is not here.</h1><a href="/">Home</a><a href="/pdf">Workspace</a><a href="/pdf-tools">Tools</a>', { status: 404 });
      case "HEAD /_next/static/chunks/app-current.ABC123.js":
        return response(null, {
          headers: { "cache-control": "public, max-age=31536000, immutable" },
        });
      default:
        return response("not found", { status: 404 });
    }
  };
}

test("production freshness accepts current raw HTML, direct Workspace entry, exact SHA, and immutable assets", async () => {
  const result = await verifyProductionFreshness({
    expectedSha: sha,
    fetchImpl: productionFetch(),
  });

  assert.equal(result.commit, sha);
  assert.match(result.immutableAsset, /app-current\.ABC123\.js$/);
});

test("production freshness rejects stale homepage HTML even when the route is healthy", async () => {
  await assert.rejects(
    verifyProductionFreshness({
      expectedSha: sha,
      fetchImpl: productionFetch({
        "GET /": response("<h1>Old homepage</h1><script src=\"/_next/static/old.js\"></script>"),
      }),
    }),
    /missing current hybrid marker/,
  );
});

test("production freshness rejects a Workspace redirect", async () => {
  await assert.rejects(
    verifyProductionFreshness({
      expectedSha: sha,
      fetchImpl: productionFetch({
        "GET /pdf": response(null, { status: 302, headers: { location: "/" } }),
      }),
    }),
    /\/pdf returned HTTP 302 \(Location: \/\)/,
  );
});

test("production freshness rejects publicly cached documents and a stale build SHA", async () => {
  await assert.rejects(
    verifyProductionFreshness({
      expectedSha: sha,
      fetchImpl: productionFetch({
        "GET /": response(currentHomepage, {
          headers: { "cache-control": "public, max-age=3600", "cf-cache-status": "HIT" },
        }),
      }),
    }),
    /positive public cache TTL/,
  );

  await assert.rejects(
    verifyProductionFreshness({
      expectedSha: sha,
      fetchImpl: productionFetch({
        "GET /api/build-info": Response.json({ commit: "0".repeat(40), environment: "production" }, { headers: { "cache-control": "no-store" } }),
      }),
    }),
    /build-info mismatch/,
  );
});


test("build metadata must be no-store even when its SHA matches", async () => {
  await assert.rejects(verifyProductionFreshness({ expectedSha: sha, fetchImpl: productionFetch({
    "GET /api/build-info": Response.json({ commit: sha, environment: "production" }),
  }) }), /must use no-store/);
});

test("network failure records sanitized diagnostics and cannot pass", async () => {
  const evidence: Array<{ networkError?: string }> = [];
  await assert.rejects(verifyProductionFreshness({ expectedSha: sha, evidence, fetchImpl: async () => {
    throw Object.assign(new Error("private document and proxy credential"), { cause: { code: "ENOTFOUND" } });
  } }), /connection failed \(ENOTFOUND\)/);
  assert.equal(evidence[0].networkError, "ENOTFOUND");
  assert.doesNotMatch(JSON.stringify(evidence), /credential|private document/);
});

test("a soft 404 and a deployment changing mid-check both fail", async () => {
  await assert.rejects(verifyProductionFreshness({ expectedSha: sha, fetchImpl: productionFetch({
    "GET /phase11-this-route-does-not-exist": response("not found"),
  }) }), /returned HTTP 200/);
  let reads = 0;
  const normal = productionFetch();
  await assert.rejects(verifyProductionFreshness({ expectedSha: sha, fetchImpl: async (url, init) => {
    if (String(url).endsWith("/api/build-info") && ++reads === 2) {
      return Response.json({ commit: "f".repeat(40), environment: "production" }, { headers: { "cache-control": "no-store" } });
    }
    return normal(url, init);
  } }), /changed during verification/);
});
