import assert from "node:assert/strict";
import test from "node:test";
import { BoundedLruCache } from "../lib/pdf/edit/boundedLruCache.ts";

test("BoundedLruCache evicts the least recently used entry", () => {
  const cache = new BoundedLruCache<string, number>(3);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  assert.equal(cache.get("a"), 1);
  cache.set("d", 4);

  assert.equal(cache.has("a"), true);
  assert.equal(cache.has("b"), false);
  assert.equal(cache.has("c"), true);
  assert.equal(cache.has("d"), true);
  assert.equal(cache.size, 3);
});

test("BoundedLruCache refreshes recency when replacing an entry", () => {
  const cache = new BoundedLruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("a", 3);
  cache.set("c", 4);

  assert.equal(cache.get("a"), 3);
  assert.equal(cache.has("b"), false);
  assert.equal(cache.get("c"), 4);
});
