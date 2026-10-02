import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("Continue with this PDF exposes Add without technical language", () => {
  const continuation = read("components/pdf/workspace/ContinueWithPdf.tsx");
  const targets = read("lib/pdf/workspace/continuation.ts");

  assert.match(targets, /label: "Add"/);
  assert.match(targets, /route: "\/pdf\/add"/);
  assert.match(continuation, /Keep working without opening the file again/);

  for (const phrase of [
    "document authority",
    "byte ownership",
    "mutation engine",
    "local session",
  ]) {
    assert.doesNotMatch(continuation, new RegExp(phrase, "i"));
  }
});

test("Add entry stays compact and keeps proven standalone routes", () => {
  const entry = read("components/pdf/workspace/AddWorkspaceEntry.tsx");

  assert.match(entry, /\/pdf\/watermark/);
  assert.match(entry, /\/pdf\/page-numbers/);
  assert.match(entry, /\/pdf\/header-footer/);
  assert.match(entry, /Choose what to add/);
  assert.match(entry, /normal standalone tool/);
});

test("Add tools can consume and republish the staged PDF", () => {
  for (const path of [
    "components/pdf/WatermarkTool.tsx",
    "components/pdf/PageNumbersTool.tsx",
    "components/pdf/HeaderFooterTool.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /takeContinuation\("enhance"\)/);
    assert.match(source, /sourceArea="enhance"/);
    assert.match(source, /ContinueWithPdf/);
    assert.match(source, /setExportedBytes/);
  }
});
