import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isFatalOfficeRuntimeError } from "../lib/conversion/browser/libreoffice/fatalRuntimeError.ts";

test("fatal Office traps are recognized only for actual Office WASM failures", () => {
  const office = "https://lumeo.in/office-runtime/zeta-24-2-2026-09-21-a/soffice.wasm";
  assert.equal(isFatalOfficeRuntimeError("operation does not support unaligned accesses", office), true);
  assert.equal(isFatalOfficeRuntimeError("unreachable", "", "RuntimeError: unreachable at " + office + ":wasm-function[1]"), true);
  assert.equal(isFatalOfficeRuntimeError("memory access out of bounds", office), true);
  assert.equal(isFatalOfficeRuntimeError("unreachable", "https://example.com/other.wasm"), false);
  assert.equal(isFatalOfficeRuntimeError("permission denied", office), false);
  assert.equal(isFatalOfficeRuntimeError("invalid input", office), false);
});

test("Office runtime fails a fatal trap without waiting five minutes or unsafe termination", async () => {
  const runtime = await readFile("lib/conversion/browser/libreoffice/BrowserLibreOfficeRuntime.ts", "utf8");
  assert.match(runtime, /isFatalOfficeRuntimeError\(message, event\.filename \|\| "", stack\)/);
  assert.match(runtime, /window\.addEventListener\("error", onFatalRuntimeError\)/);
  assert.match(runtime, /window\.removeEventListener\("error", onFatalRuntimeError\)/);
  assert.match(runtime, /this\.fatalRuntimeError = new Error/);
  assert.match(runtime, /if \(this\.fatalRuntimeError\) throw this\.fatalRuntimeError/);
  assert.match(runtime, /finish\(reject, this\.fatalRuntimeError\)/);
  assert.doesNotMatch(runtime, /terminateAllThreads/);
});

test("HTML to PDF retains generated Blob URLs through the Safari download handoff", async () => {
  const html = await readFile("components/pdf/HtmlToPdfTool.tsx", "utf8");
  assert.match(html, /link\.click\(\);\s*link\.remove\(\);\s*\/\/ Revoking/);
  assert.match(html, /window\.setTimeout\(\(\) => URL\.revokeObjectURL\(blobUrl\), 60_000\)/);
  assert.doesNotMatch(html, /link\.click\(\);\s*link\.remove\(\);\s*URL\.revokeObjectURL\(blobUrl\)/);
  assert.match(html, /createFreshPdfContinuation/);
});

test("failed production conversions report actual application error states", async () => {
  const [word, html] = await Promise.all([
    readFile("e2e/production-conversion-smoke.spec.ts", "utf8"),
    readFile("e2e/production-conversion-certification.spec.ts", "utf8"),
  ]);
  assert.match(word, /Word to PDF professional fidelity failed/);
  assert.match(word, /failure\.waitFor\(\{ state: "visible", timeout: 330_000 \}\)/);
  assert.match(html, /HTML to PDF failed/);
  assert.match(html, /page\.waitForEvent\("download", \{ timeout: 240_000 \}\)/);
});
