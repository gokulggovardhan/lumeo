import assert from "node:assert/strict";
import test from "node:test";

import { withProductionSecurityHeaders } from "../worker/response-policy.ts";

test("adds baseline security headers on production responses without changing cache policy", () => {
  const request = new Request("https://lumeo.in/pdf/edit");
  const source = new Response("ok", {
    status: 200,
    headers: { "Cache-Control": "private, no-store" },
  });

  const response = withProductionSecurityHeaders(request, source);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000",
  );
});

test("leaves local development responses untouched", () => {
  const request = new Request("http://127.0.0.1:3001/pdf/edit");
  const source = new Response("ok");
  const response = withProductionSecurityHeaders(request, source);

  assert.equal(response, source);
  assert.equal(response.headers.get("x-frame-options"), null);
});

test("adds cross-origin isolation headers for browser Office routes", () => {
  for (const path of [
    "/pdf/word-to-pdf",
    "/pdf/word-to-pdf/session",
    "/internal/conversion-production-smoke",
    "/internal/conversion-lab/example",
    "/dashboard/projects/demo",
  ]) {
    const response = withProductionSecurityHeaders(
      new Request(`https://lumeo.in${path}`),
      new Response("ok"),
    );

    assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
    assert.equal(
      response.headers.get("cross-origin-embedder-policy"),
      "require-corp",
    );
  }
});

test("does not add cross-origin isolation headers to unrelated production routes", () => {
  const response = withProductionSecurityHeaders(
    new Request("https://lumeo.in/pdf/edit"),
    new Response("ok"),
  );

  assert.equal(response.headers.get("cross-origin-opener-policy"), null);
  assert.equal(response.headers.get("cross-origin-embedder-policy"), null);
});

