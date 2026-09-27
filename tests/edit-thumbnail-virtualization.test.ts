import assert from "node:assert/strict";
import test from "node:test";
import {
  THUMBNAIL_ROW_HEIGHT_PX,
  computeThumbnailWindow,
  scrollTopForThumbnail,
} from "../lib/pdf/edit/thumbnailVirtualization.ts";

test("small page rails stay fully materialized", () => {
  const window = computeThumbnailWindow({
    pageCount: 12,
    scrollTop: 0,
    viewportHeight: 600,
  });

  assert.equal(window.virtualized, false);
  assert.equal(window.startIndex, 0);
  assert.equal(window.endIndexExclusive, 12);
  assert.deepEqual(window.indices, Array.from({ length: 12 }, (_, index) => index));
});

test("large page rails materialize only the visible slice plus overscan", () => {
  const window = computeThumbnailWindow({
    pageCount: 300,
    scrollTop: THUMBNAIL_ROW_HEIGHT_PX * 120,
    viewportHeight: THUMBNAIL_ROW_HEIGHT_PX * 6,
    overscanRows: 4,
  });

  assert.equal(window.virtualized, true);
  assert.equal(window.startIndex, 116);
  assert.equal(window.endIndexExclusive, 130);
  assert.equal(window.indices.length, 14);
  assert.equal(window.indices[0], 116);
  assert.equal(window.indices.at(-1), 129);
  assert.equal(window.topSpacerPx, 116 * THUMBNAIL_ROW_HEIGHT_PX);
  assert.equal(window.bottomSpacerPx, 170 * THUMBNAIL_ROW_HEIGHT_PX);
});

test("thumbnail window clamps safely at document edges", () => {
  const start = computeThumbnailWindow({
    pageCount: 100,
    scrollTop: 0,
    viewportHeight: THUMBNAIL_ROW_HEIGHT_PX * 4,
  });
  assert.equal(start.startIndex, 0);

  const end = computeThumbnailWindow({
    pageCount: 100,
    scrollTop: THUMBNAIL_ROW_HEIGHT_PX * 99,
    viewportHeight: THUMBNAIL_ROW_HEIGHT_PX * 4,
  });
  assert.equal(end.endIndexExclusive, 100);
  assert.equal(end.bottomSpacerPx, 0);
});

test("scrollTopForThumbnail centers a distant active page without changing page identity", () => {
  const scrollTop = scrollTopForThumbnail({
    pageIndex: 200,
    viewportHeight: THUMBNAIL_ROW_HEIGHT_PX * 8,
  });

  assert.equal(scrollTop > THUMBNAIL_ROW_HEIGHT_PX * 190, true);
  assert.equal(scrollTop < THUMBNAIL_ROW_HEIGHT_PX * 200, true);
});
