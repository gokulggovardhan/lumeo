import assert from "node:assert/strict";
import test from "node:test";
import {
  bindSearchableOcrPublicationRevision,
  resolveSearchableOcrPublicationSource,
} from "../lib/pdf/edit/searchableOcrPublication.ts";

function bytes(seed: number): ArrayBuffer {
  return new Uint8Array([seed, seed + 1, seed + 2]).buffer;
}

test("first searchable OCR publication writes from the current PDF revision", () => {
  const current = bytes(1);
  const source = resolveSearchableOcrPublicationSource({
    currentBytes: current,
    pageIndex: 0,
    publication: null,
  });
  assert.equal(source.kind, "initial");
  assert.equal(source.currentBytes, current);
  assert.equal(source.writerSourceBytes, current);
  assert.equal(source.baseBytes, current);
});

test("session-owned searchable OCR regeneration writes from the preserved pre-layer revision", () => {
  const base = bytes(10);
  const firstPublished = bytes(20);
  const publication = bindSearchableOcrPublicationRevision({
    source: resolveSearchableOcrPublicationSource({
      currentBytes: base,
      pageIndex: 2,
      publication: null,
    }),
    publishedBytes: firstPublished,
    pageIndex: 2,
  });

  const source = resolveSearchableOcrPublicationSource({
    currentBytes: firstPublished,
    pageIndex: 2,
    publication,
  });
  assert.equal(source.kind, "regenerate");
  assert.equal(source.currentBytes, firstPublished);
  assert.equal(source.writerSourceBytes, base);
  assert.equal(source.baseBytes, base);
});

test("regeneration ownership fails closed after any unrelated PDF revision change", () => {
  const base = bytes(30);
  const published = bytes(40);
  const unrelatedMutation = bytes(50);
  const publication = bindSearchableOcrPublicationRevision({
    source: resolveSearchableOcrPublicationSource({
      currentBytes: base,
      pageIndex: 0,
      publication: null,
    }),
    publishedBytes: published,
    pageIndex: 0,
  });

  const source = resolveSearchableOcrPublicationSource({
    currentBytes: unrelatedMutation,
    pageIndex: 0,
    publication,
  });
  assert.equal(source.kind, "initial");
  assert.equal(source.writerSourceBytes, unrelatedMutation);
  assert.equal(source.baseBytes, unrelatedMutation);
});

test("publication ownership is page-scoped", () => {
  const base = bytes(60);
  const published = bytes(70);
  const publication = bindSearchableOcrPublicationRevision({
    source: resolveSearchableOcrPublicationSource({
      currentBytes: base,
      pageIndex: 1,
      publication: null,
    }),
    publishedBytes: published,
    pageIndex: 1,
  });

  const source = resolveSearchableOcrPublicationSource({
    currentBytes: published,
    pageIndex: 2,
    publication,
  });
  assert.equal(source.kind, "initial");
  assert.equal(source.writerSourceBytes, published);
});

test("regenerated publication keeps the original preserved base across repeated corrections", () => {
  const base = bytes(80);
  const first = bytes(90);
  const second = bytes(100);
  const firstSource = resolveSearchableOcrPublicationSource({
    currentBytes: base,
    pageIndex: 0,
    publication: null,
  });
  const firstPublication = bindSearchableOcrPublicationRevision({
    source: firstSource,
    publishedBytes: first,
    pageIndex: 0,
  });
  const secondSource = resolveSearchableOcrPublicationSource({
    currentBytes: first,
    pageIndex: 0,
    publication: firstPublication,
  });
  const secondPublication = bindSearchableOcrPublicationRevision({
    source: secondSource,
    publishedBytes: second,
    pageIndex: 0,
  });
  assert.equal(secondPublication.baseBytes, base);
  assert.equal(secondPublication.publishedBytes, second);
});
