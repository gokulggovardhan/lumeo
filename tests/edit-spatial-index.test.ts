import assert from "node:assert/strict";
import test from "node:test";
import { PercentSpatialIndex } from "../lib/pdf/edit/spatialIndex.ts";

type Item = {
  id: string;
  box: { xPct: number; yPct: number; widthPct: number; heightPct: number };
};

test("PercentSpatialIndex preserves topmost source order for overlapping text spans", () => {
  const items: Item[] = [
    { id: "bottom", box: { xPct: 10, yPct: 10, widthPct: 20, heightPct: 5 } },
    { id: "top", box: { xPct: 10, yPct: 10, widthPct: 20, heightPct: 5 } },
    { id: "far", box: { xPct: 70, yPct: 70, widthPct: 10, heightPct: 10 } },
  ];
  const index = new PercentSpatialIndex(items, 4);
  assert.deepEqual(index.queryPoint(15, 12).map((item) => item.id), ["bottom", "top"]);
  assert.equal(index.topmostAt(15, 12)?.id, "top");
  assert.equal(index.topmostAt(50, 50), null);
});

test("PercentSpatialIndex range queries deduplicate boxes spanning several grid cells", () => {
  const items: Item[] = [
    { id: "wide", box: { xPct: 5, yPct: 5, widthPct: 40, heightPct: 20 } },
    { id: "right", box: { xPct: 55, yPct: 10, widthPct: 10, heightPct: 10 } },
    { id: "outside", box: { xPct: 80, yPct: 80, widthPct: 10, heightPct: 10 } },
  ];
  const index = new PercentSpatialIndex(items, 5);
  assert.deepEqual(
    index.queryBox({ xPct: 20, yPct: 0, widthPct: 50, heightPct: 30 }).map((item) => item.id),
    ["wide", "right"],
  );
});

test("PercentSpatialIndex rejects invalid cell sizes", () => {
  assert.throws(() => new PercentSpatialIndex<Item>([], 0), /cell size/);
  assert.throws(() => new PercentSpatialIndex<Item>([], 101), /cell size/);
});
