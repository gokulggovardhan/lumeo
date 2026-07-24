import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialItems,
  duplicateItem,
  moveItem,
  removeItem,
  removeItems,
  rotateItem,
  rotateItems,
  validateOrganizeItems,
} from "../lib/pdf/pageOrganizer.ts";

test("creates one item per page, in order, with zero rotation", () => {
  const items = createInitialItems(3);
  assert.deepEqual(
    items.map((item) => item.sourcePage),
    [1, 2, 3],
  );
  assert.ok(items.every((item) => item.rotation === 0));
  assert.equal(new Set(items.map((item) => item.id)).size, 3);
});

test("moveItem reorders by index and is a no-op for invalid indices", () => {
  const items = createInitialItems(3);
  const moved = moveItem(items, 0, 2);
  assert.deepEqual(
    moved.map((item) => item.sourcePage),
    [2, 3, 1],
  );
  assert.deepEqual(moveItem(items, 0, 0), items);
  assert.deepEqual(moveItem(items, -1, 1), items);
  assert.deepEqual(moveItem(items, 0, 99), items);
});

test("duplicateItem inserts a copy with a new id right after the source", () => {
  const items = createInitialItems(2);
  const next = duplicateItem(items, 0, "page-1-dup-1");
  assert.deepEqual(
    next.map((item) => item.sourcePage),
    [1, 1, 2],
  );
  assert.equal(next[1].id, "page-1-dup-1");
  assert.notEqual(next[1].id, next[0].id);
});

test("removeItem and removeItems drop by index, not by page number", () => {
  const items = createInitialItems(3);
  assert.deepEqual(
    removeItem(items, 1).map((item) => item.sourcePage),
    [1, 3],
  );
  assert.deepEqual(
    removeItems(items, new Set([0, 2])).map((item) => item.sourcePage),
    [2],
  );
});

test("rotateItem and rotateItems accumulate and normalize rotation", () => {
  const items = createInitialItems(2);
  const oneTurn = rotateItem(items, 0, "right");
  assert.equal(oneTurn[0].rotation, 90);
  const fourTurns = [1, 2, 3].reduce((acc, _n) => rotateItem(acc, 0, "right"), oneTurn);
  assert.equal(fourTurns[0].rotation, 0);

  const bulk = rotateItems(items, new Set([0, 1]), "left");
  assert.equal(bulk[0].rotation, 270);
  assert.equal(bulk[1].rotation, 270);
});

test("validateOrganizeItems rejects an empty document", () => {
  assert.match(validateOrganizeItems([]) ?? "", /empty/);
  assert.equal(validateOrganizeItems(createInitialItems(1)), null);
});
