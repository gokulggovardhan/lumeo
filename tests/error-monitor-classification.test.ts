import assert from "node:assert/strict";
import test from "node:test";
import { isNonActionableGlobalClientError } from "../lib/errors/classification.ts";

test("React #412 connection-closed transport teardown is excluded from application error incidents", () => {
  assert.equal(
    isNonActionableGlobalClientError(
      "Minified React error #412; visit https://react.dev/errors/412 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.",
    ),
    true,
  );
});

test("other React, dynamic-import and application errors remain reportable", () => {
  for (const message of [
    "Minified React error #418; visit https://react.dev/errors/418",
    "Failed to fetch dynamically imported module: https://lumeo.in/_next/static/chunks/example.js",
    "TypeError: Cannot read properties of undefined",
    "Connection closed.",
  ]) {
    assert.equal(isNonActionableGlobalClientError(message), false, message);
  }
});
