import assert from "node:assert/strict";
import test from "node:test";

import { canonicalRedirectUrl } from "../worker/canonical-routing.ts";

test("redirects production HTTP requests to HTTPS apex", () => {
  assert.equal(
    canonicalRedirectUrl("http://lumeo.in/pdf/edit?x=1", "http"),
    "https://lumeo.in/pdf/edit?x=1",
  );
});

test("redirects www to the canonical apex and preserves path/query", () => {
  assert.equal(
    canonicalRedirectUrl("https://www.lumeo.in/pdf/crop?a=1", "https"),
    "https://lumeo.in/pdf/crop?a=1",
  );
});

test("leaves canonical HTTPS production requests untouched", () => {
  assert.equal(
    canonicalRedirectUrl("https://lumeo.in/pdf/watermark", "https"),
    null,
  );
});

test("does not redirect local vinext development", () => {
  assert.equal(
    canonicalRedirectUrl("http://127.0.0.1:3001/pdf/edit", "http"),
    null,
  );
});
