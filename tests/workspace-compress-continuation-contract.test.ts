import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("Continue with this PDF exposes Compress as a simple action", () => {
  const source = read("components/pdf/workspace/ContinueWithPdf.tsx");
  assert.match(source, /area: "optimize", label: "Compress", route: "\/pdf\/compress"/);
});

test("Compress adopts a staged PDF without replacing its proven engine", () => {
  const source = read("components/pdf/CompressPdfTool.tsx");

  assert.match(source, /takeContinuation\("optimize"\)/);
  assert.match(source, /sourceArea="optimize"/);
  assert.match(source, /bytes: outputBuffer/);
  assert.match(source, /ContinueWithPdf/);
  assert.match(source, /Download compressed PDF/);
  assert.match(source, /buildCompressedCandidate/);
});

test("Compress continuation does not introduce persistent or network file storage", () => {
  const adapter = read("lib/pdf/workspace/compressAdapter.ts");
  const tool = read("components/pdf/CompressPdfTool.tsx");

  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "OPFS",
    "navigator.sendBeacon",
  ]) {
    assert.doesNotMatch(`${adapter}\n${tool}`, new RegExp(forbidden, "i"));
  }
});
