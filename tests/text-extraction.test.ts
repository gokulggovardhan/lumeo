import assert from "node:assert/strict";
import test from "node:test";
import { buildTxtFile, isEffectivelyEmpty, joinTextItems } from "../lib/pdf/textExtraction.ts";

test("joinTextItems joins string items with spaces, trims, and collapses blank runs", () => {
  const items = [{ str: "Hello" }, { str: "world" }, { str: "" }, { str: "!" }];
  assert.equal(joinTextItems(items), "Hello world !");
});

test("joinTextItems returns an empty string for no items", () => {
  assert.equal(joinTextItems([]), "");
});

test("isEffectivelyEmpty detects whitespace-only page text across all pages", () => {
  assert.equal(isEffectivelyEmpty(["", "   ", "\n"]), true);
  assert.equal(isEffectivelyEmpty(["", "Some text"]), false);
  assert.equal(isEffectivelyEmpty([]), true);
});

test("buildTxtFile separates pages with a labeled divider", () => {
  const output = buildTxtFile(["Page one text", "Page two text"]);
  assert.match(output, /--- Page 1 ---/);
  assert.match(output, /--- Page 2 ---/);
  assert.ok(output.indexOf("Page one text") < output.indexOf("--- Page 2 ---"));
});
