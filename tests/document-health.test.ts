import assert from "node:assert/strict";
import test from "node:test";
import { getDocumentHealthSuggestions } from "../lib/pdf/workspace/documentHealth.ts";

test("document health stays quiet for a normal searchable PDF", () => {
  assert.deepEqual(
    getDocumentHealthSuggestions({
      byteLength: 2 * 1024 * 1024,
      pageCount: 12,
      hasSearchableText: true,
      scannedPageCount: 0,
      rotatedPageCount: 0,
      imageHeavy: false,
    }),
    [],
  );
});

test("document health suggests only relevant actions in priority order", () => {
  const suggestions = getDocumentHealthSuggestions({
    byteLength: 40 * 1024 * 1024,
    pageCount: 50,
    hasSearchableText: false,
    scannedPageCount: 10,
    rotatedPageCount: 2,
    imageHeavy: true,
  });

  assert.deepEqual(
    suggestions.map(({ id, area, priority }) => ({ id, area, priority })),
    [
      { id: "ocr", area: "enhance", priority: 1 },
      { id: "rotate", area: "pages", priority: 1 },
      { id: "compress", area: "optimize", priority: 2 },
      { id: "optimize-images", area: "optimize", priority: 3 },
    ],
  );
});

test("large-file suggestion starts at the intended threshold", () => {
  assert.equal(
    getDocumentHealthSuggestions({
      byteLength: 25 * 1024 * 1024 - 1,
      pageCount: 1,
    }).some((item) => item.id === "compress"),
    false,
  );
  assert.equal(
    getDocumentHealthSuggestions({
      byteLength: 25 * 1024 * 1024,
      pageCount: 1,
    }).some((item) => item.id === "compress"),
    true,
  );
});
