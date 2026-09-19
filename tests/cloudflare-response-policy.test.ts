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
