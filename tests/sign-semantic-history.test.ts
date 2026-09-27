import assert from "node:assert/strict";
import test from "node:test";
import { deriveSignSemanticHistory } from "../lib/sign/signSemanticHistory.ts";
import type { PlacedElement } from "../lib/sign/types.ts";

const textElement: PlacedElement = {
  id: "sign-text-1",
  type: "text",
  pageIndex: 0,
  xPct: 10,
  yPct: 20,
  widthPct: 25,
  heightPct: 8,
  rotationDeg: 0,
  text: "Approved",
  fontSizePt: 14,
};

test("Sign insertion uses the shared semantic vocabulary", () => {
  const drafts = deriveSignSemanticHistory([], [textElement]);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].tool, "sign");
  assert.equal(drafts[0].type, "insert");
  assert.deepEqual(drafts[0].target, {
    kind: "element",
    pageIndex: 0,
    elementId: "sign-text-1",
    elementType: "text",
  });
  assert.equal(drafts[0].after?.text, "Approved");
  assert.equal(drafts[0].after?.geometry?.xPct, 10);
});

test("Sign drag and text edits are independent semantic changes", () => {
  const changed: PlacedElement = {
    ...textElement,
    xPct: 31,
    yPct: 42,
    text: "Approved by reviewer",
  };
  const drafts = deriveSignSemanticHistory([textElement], [changed]);

  assert.deepEqual(
    drafts.map((draft) => draft.type),
    ["change-geometry", "replace-text"],
  );
  assert.equal(drafts[0].before?.geometry?.xPct, 10);
  assert.equal(drafts[0].after?.geometry?.xPct, 31);
  assert.equal(drafts[1].before?.text, "Approved");
  assert.equal(drafts[1].after?.text, "Approved by reviewer");
});

test("Sign semantic history never duplicates signature image data", () => {
  const signature: PlacedElement = {
    id: "signature-1",
    type: "signature",
    pageIndex: 0,
    xPct: 20,
    yPct: 30,
    widthPct: 24,
    heightPct: 10,
    rotationDeg: 0,
    signatureId: "saved-signature-1",
    dataUrl: "data:image/png;base64,SECRET-PIXELS",
    aspectRatio: 2.4,
  };

  const drafts = deriveSignSemanticHistory([], [signature]);
  const serialized = JSON.stringify(drafts);
  assert.equal(serialized.includes("SECRET-PIXELS"), false);
  assert.equal(serialized.includes("data:image"), false);
  assert.equal(drafts[0].target.kind, "element");
  assert.equal(drafts[0].after?.present, true);
});
