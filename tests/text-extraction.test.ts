import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCsvFromEntries,
  buildJsonFromEntries,
  buildTxtFromEntries,
  isEffectivelyEmpty,
  joinTextItems,
  parsePageRange,
  selectPageEntries,
} from "../lib/pdf/textExtraction.ts";

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

test("parsePageRange treats empty input as no filter", () => {
  const result = parsePageRange("", 10);
  assert.equal(result.pages, null);
  assert.equal(result.error, null);
});

test("parsePageRange parses single pages, ranges, and mixed lists", () => {
  assert.deepEqual([...parsePageRange("1,3,5", 10).pages], [1, 3, 5]);
  assert.deepEqual([...parsePageRange("1-3", 10).pages], [1, 2, 3]);
  assert.deepEqual([...parsePageRange("1-3, 7", 10).pages], [1, 2, 3, 7]);
});

test("parsePageRange clamps ranges to the document's real page count", () => {
  assert.deepEqual([...parsePageRange("8-20", 10).pages], [8, 9, 10]);
  assert.equal(parsePageRange("50", 10).pages, null);
  assert.match(parsePageRange("50", 10).error ?? "", /No pages matched/);
});

test("parsePageRange rejects invalid tokens with a specific message", () => {
  assert.match(parsePageRange("abc", 10).error ?? "", /valid page number/);
  assert.match(parsePageRange("5-2", 10).error ?? "", /valid page range/);
  assert.match(parsePageRange("0", 10).error ?? "", /valid page number/);
});

test("selectPageEntries returns every page with its real page number when unfiltered", () => {
  const entries = selectPageEntries(["one", "two", "three"], null);
  assert.deepEqual(entries, [
    { page: 1, text: "one" },
    { page: 2, text: "two" },
    { page: 3, text: "three" },
  ]);
});

test("selectPageEntries applies a page filter and keeps correct page numbers", () => {
  const entries = selectPageEntries(["one", "two", "three"], new Set([1, 3]));
  assert.deepEqual(entries, [
    { page: 1, text: "one" },
    { page: 3, text: "three" },
  ]);
});

test("selectPageEntries returns an empty array when the filter matches nothing", () => {
  assert.deepEqual(selectPageEntries(["one", "two"], new Set([9])), []);
});

test("buildTxtFromEntries labels each entry with its real page number", () => {
  const output = buildTxtFromEntries([
    { page: 1, text: "Page one text" },
    { page: 3, text: "Page three text" },
  ]);
  assert.match(output, /--- Page 1 ---/);
  assert.match(output, /--- Page 3 ---/);
  assert.equal(output.includes("--- Page 2 ---"), false);
  assert.ok(output.indexOf("Page one text") < output.indexOf("--- Page 3 ---"));
});

test("buildJsonFromEntries produces an array of {page, text} objects", () => {
  const entries = [
    { page: 1, text: "one" },
    { page: 3, text: "three" },
  ];
  assert.deepEqual(JSON.parse(buildJsonFromEntries(entries)), entries);
});

test("buildCsvFromEntries produces a page,text CSV with a header row", () => {
  const output = buildCsvFromEntries([{ page: 1, text: "plain" }]);
  const lines = output.split("\n");
  assert.equal(lines[0], "page,text");
  assert.equal(lines[1], "1,plain");
});

test("buildCsvFromEntries escapes commas, quotes, and newlines", () => {
  const output = buildCsvFromEntries([{ page: 1, text: 'has, a "quote"\nand a newline' }]);
  const lines = output.split("\n");
  assert.equal(lines[1], '1,"has, a ""quote""');
  assert.equal(lines[2], 'and a newline"');
});
