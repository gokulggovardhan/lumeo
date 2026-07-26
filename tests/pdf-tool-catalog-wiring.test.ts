import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { lumeoTools } from "../lib/tools/catalog.ts";

function findAction(slug: string) {
  for (const tool of lumeoTools) {
    const action = tool.actions.find((item) => item.slug === slug);
    if (action) return action;
  }
  return undefined;
}

test("organizer actions are live and routed to /pdf/organize", () => {
  for (const slug of ["reorder", "rotate", "remove-pages", "duplicate-page"]) {
    const action = findAction(slug);
    assert.ok(action, `expected action ${slug} to exist`);
    assert.equal(action?.live, true);
    assert.equal(action?.route, "/pdf/organize");
  }
});

test("extract-pages stays routed to the existing Split tool", () => {
  const action = findAction("extract-pages");
  assert.equal(action?.route, "/pdf/split");
});

test("extract-text is live and routed to /pdf/extract-text", () => {
  const action = findAction("extract-text");
  assert.equal(action?.live, true);
  assert.equal(action?.route, "/pdf/extract-text");
});

test("html-to-pdf is live and routed to /pdf/html-to-pdf", () => {
  const action = findAction("html-to-pdf");
  assert.equal(action?.live, true);
  assert.equal(action?.route, "/pdf/html-to-pdf");
});

test("PdfToolRegistry includes the three new tools", () => {
  const registryContent = readFileSync("components/pdf/PdfToolRegistry.tsx", "utf8");
  assert.match(registryContent, /slug:\s*"organize"/);
  assert.match(registryContent, /slug:\s*"html-to-pdf"/);
  assert.match(registryContent, /slug:\s*"extract-text"/);
});

test("edit is live and routed to /pdf/edit", () => {
  const action = findAction("edit");
  assert.ok(action, "expected action edit to exist");
  assert.equal(action?.live, true);
  assert.equal(action?.route, "/pdf/edit");
});

test("PdfToolRegistry includes edit", () => {
  const registryContent = readFileSync("components/pdf/PdfToolRegistry.tsx", "utf8");
  assert.match(registryContent, /slug:\s*"edit"/);
});
