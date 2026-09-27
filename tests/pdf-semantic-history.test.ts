import assert from "node:assert/strict";
import test from "node:test";
import {
  appendPdfSemanticHistory,
  createPdfSemanticHistory,
} from "../lib/pdf/history/semanticHistory.ts";

test("shared semantic history uses deterministic type target before after entries without mutating prior state", () => {
  const initial = createPdfSemanticHistory();
  const next = appendPdfSemanticHistory(initial, [
    {
      tool: "edit",
      type: "replace-text",
      target: {
        kind: "text",
        source: "native",
        pageIndex: 0,
        ids: ["p0-span-1"],
      },
      before: { text: "Before" },
      after: { text: "After" },
    },
  ]);

  assert.equal(initial.entries.length, 0);
  assert.equal(initial.nextSequence, 1);
  assert.equal(next.entries.length, 1);
  assert.equal(next.entries[0].id, "semantic-1");
  assert.equal(next.entries[0].sequence, 1);
  assert.equal(next.entries[0].tool, "edit");
  assert.equal(next.entries[0].type, "replace-text");
  assert.deepEqual(next.entries[0].target, {
    kind: "text",
    source: "native",
    pageIndex: 0,
    ids: ["p0-span-1"],
  });
  assert.deepEqual(next.entries[0].before, { text: "Before" });
  assert.deepEqual(next.entries[0].after, { text: "After" });
  assert.equal(next.nextSequence, 2);
});

test("semantic history clones array and state payloads so later caller mutation cannot rewrite history", () => {
  const ids = ["span-a"];
  const before = {
    geometry: {
      pageIndex: 1,
      xPct: 10,
      yPct: 20,
      widthPct: 30,
      heightPct: 40,
    },
  };
  const next = appendPdfSemanticHistory(createPdfSemanticHistory(), [
    {
      tool: "edit",
      type: "change-geometry",
      target: {
        kind: "text",
        source: "native",
        pageIndex: 1,
        ids,
      },
      before,
      after: {
        geometry: {
          pageIndex: 1,
          xPct: 11,
          yPct: 20,
          widthPct: 30,
          heightPct: 40,
        },
      },
    },
  ]);

  ids.push("span-b");
  before.geometry.xPct = 999;

  const entry = next.entries[0];
  assert.equal(entry.target.kind, "text");
  if (entry.target.kind === "text") {
    assert.deepEqual(entry.target.ids, ["span-a"]);
  }
  assert.equal(entry.before?.geometry?.xPct, 10);
});
