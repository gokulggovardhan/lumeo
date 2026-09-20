import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeErrorDiagnostic } from "../lib/admin/error-display.ts";

test("error diagnostics redact common credentials while preserving useful stack text", () => {
  const input = [
    "Error: request failed",
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz.12345678.signature",
    "password=hunter2",
    "api_key=super-secret-key",
    "sb_secret_do_not_show",
    "postgresql://dbuser:dbpass@db.example.test/postgres",
    "    at run (/app/server.js:10:4)",
  ].join("\n");

  const output = sanitizeErrorDiagnostic(input);
  assert.ok(output);
  assert.match(output, /Error: request failed/);
  assert.match(output, /at run/);
  assert.doesNotMatch(output, /hunter2|super-secret-key|do_not_show|dbpass/);
  assert.match(output, /\[REDACTED/);
});

test("HTML-like error content remains inert text and control characters are normalized", () => {
  const input = "<script>alert('xss')</script>\u0000\r\n<img src=x onerror=alert(1)>";
  const output = sanitizeErrorDiagnostic(input);
  assert.equal(
    output,
    "<script>alert('xss')</script>\n<img src=x onerror=alert(1)>",
  );
});
