// tests/edit-rotated-text.test.ts
//
// Phase 4 of true PDF text editing (rotated-text slice): the in-place
// editing engine (lib/pdf/edit/{contentStream,fontMetrics,editPlan,
// applyEditPlan}.ts) computes each text-showing operator's rendering
// matrix (Trm = fontScale . Tm . CTM, per spec 9.4.4) as a fully general
// 2x3 affine transform, and every measurement it makes for a rewrite
// (glyph advance, TJ spacing adjustment) happens entirely in TEXT SPACE
// -- before Tm/CTM are applied -- so it was never dependent on the text
// being axis-aligned. A rewrite only ever replaces a Tj/TJ/'/" operator's
// own string bytes; it never touches the Tf/Tm/Td/cm operators that
// establish rotation, so rotation is preserved automatically, by
// construction, not by any rotation-specific logic.
//
// This file exists to prove that claim with real, saved, reloaded,
// pdfjs-extracted PDFs -- not to add new rotation-handling code (none was
// needed; see the PR description for the one real bug this slice did
// surface and fix: lib/pdf/edit/applyEditPlan.ts's locateContentStream
// hit the same context.lookupMaybe(ref, Type)-throws-on-type-mismatch bug
// already fixed in lib/pdf/edit/formXObjects.ts, this time for a page
// with a single, non-array-wrapped /Contents stream -- a common
// real-world shape a rotated-text page can easily have).

import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFName, PDFDict, StandardFonts } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { resolveFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import { buildEditPlan } from "../lib/pdf/edit/editPlan.ts";
import { applyEditPlanToDocument } from "../lib/pdf/edit/applyEditPlan.ts";

async function extractPageStrings(pdfBytes: Uint8Array, pageNumber = 1): Promise<string[]> {
  const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).filter((str) => str.length > 0);
}

// PDF content-stream numbers don't support exponential notation (e.g.
// "6.123233995736766e-17", which Number.prototype.toString() produces for
// cos(90deg)) -- fixed-point avoids that entirely, matching how real PDF
// writers (including pdf-lib itself) always format operands.
function fmt(n: number): string {
  return n.toFixed(6);
}

function rotationMatrix(angleDeg: number, tx: number, ty: number): [number, number, number, number, number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), tx, ty];
}

// Builds a single-content-stream page (a bare, non-array-wrapped
// /Contents ref -- the shape that surfaced this slice's real bug) with
// one BT...ET text object per (matrix, text) pair, each shown with its
// own Tm (so each block's rotation is independent of the others).
function buildRotatedTextPage(text: string, matrix: [number, number, number, number, number, number]) {
  return `BT /F1 20 Tf ${matrix.map(fmt).join(" ")} Tm (${text}) Tj ET`;
}

async function buildDoc(blocks: { text: string; matrix: [number, number, number, number, number, number] }[]) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.node.Resources()!.set(PDFName.of("Font"), doc.context.obj({ F1: font.ref }));
  const content = blocks.map((b) => buildRotatedTextPage(b.text, b.matrix)).join("\n");
  page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream(content)));
  return doc;
}

async function editFirstOperator(originalBytes: Uint8Array, replacementText: string): Promise<Uint8Array> {
  const loaded = await PDFDocument.load(originalBytes.slice());
  const located = collectPageTextOperators(loaded, 0);
  assert.ok(located.length > 0, "expected at least one text-show operator");

  const fontDict = (located[0].resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict).lookup(PDFName.of("F1"), PDFDict);
  const resolvedFont = resolveFont(fontDict, loaded.context);
  const fontMetrics = resolveFontMetrics(fontDict, loaded.context, resolvedFont);
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    formPath: located[0].locator.kind === "xobject" ? located[0].locator.formPath : null,
    operatorIndex: 0,
    operator: located[0].operator,
    replacementText,
    resolvedFont,
    fontMetrics,
  });
  assert.equal(plan.editable, true, plan.reason ?? "");

  const editedDoc = await PDFDocument.load(originalBytes.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  return editedDoc.save();
}

for (const angleDeg of [90, 180, 270]) {
  test(`${angleDeg}-degree rotated text: edited text survives save + reload + pdfjs extraction, still rotated`, async () => {
    const matrix = rotationMatrix(angleDeg, 300, 400);
    const doc = await buildDoc([{ text: `Rot${angleDeg}`, matrix }]);
    const original = await doc.save();
    assert.deepEqual(await extractPageStrings(original), [`Rot${angleDeg}`]);

    const loaded = await PDFDocument.load(original.slice());
    const located = collectPageTextOperators(loaded, 0);
    assert.equal(located.length, 1);
    // The rotation's off-diagonal components must be present in the
    // computed rendering matrix (proving it wasn't silently flattened to
    // an axis-aligned approximation anywhere in the detection path).
    const [a, b, c] = located[0].operator.textRenderingMatrix;
    assert.ok(Math.abs(a) > 1e-6 || Math.abs(b) > 1e-6, "expected a non-trivial rotation component");
    assert.ok(Math.abs(b - -c) < 1e-6 || angleDeg === 180, "expected the rotation's symmetry to be preserved");

    const editedBytes = await editFirstOperator(original, `Edited${angleDeg}`);
    assert.deepEqual(await extractPageStrings(editedBytes), [`Edited${angleDeg}`]);

    // Re-detect after the edit: the rendering matrix's rotation must be
    // byte-identical to before, since a Tj rewrite never touches Tm/CTM.
    const reloaded = await PDFDocument.load(editedBytes.slice());
    const relocated = collectPageTextOperators(reloaded, 0);
    assert.equal(relocated.length, 1);
    assert.deepEqual(relocated[0].operator.textRenderingMatrix.slice(0, 4), located[0].operator.textRenderingMatrix.slice(0, 4));
  });
}

test("arbitrary-angle (37 degree) rotated text: edited text survives save + reload + pdfjs extraction", async () => {
  const matrix = rotationMatrix(37, 250, 350);
  const doc = await buildDoc([{ text: "Skewed text", matrix }]);
  const original = await doc.save();
  assert.deepEqual(await extractPageStrings(original), ["Skewed text"]);

  const loaded = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(loaded, 0);
  const [a, b] = located[0].operator.textRenderingMatrix;
  const detectedAngleDeg = (Math.atan2(b, a) * 180) / Math.PI;
  assert.ok(Math.abs(detectedAngleDeg - 37) < 0.01, `expected ~37deg, got ${detectedAngleDeg}`);

  const editedBytes = await editFirstOperator(original, "Still at 37 degrees");
  assert.deepEqual(await extractPageStrings(editedBytes), ["Still at 37 degrees"]);
});

test("mixed rotated and non-rotated text on the same page: editing one leaves the other's rotation/content untouched", async () => {
  const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 100, 100];
  const rotated90 = rotationMatrix(90, 300, 400);
  const doc = await buildDoc([
    { text: "Flat text", matrix: identity },
    { text: "Vertical text", matrix: rotated90 },
  ]);
  const original = await doc.save();
  assert.deepEqual(await extractPageStrings(original), ["Flat text", "Vertical text"]);

  const loaded = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(loaded, 0);
  assert.equal(located.length, 2);

  const fontDict = (located[0].resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict).lookup(PDFName.of("F1"), PDFDict);
  const resolvedFont = resolveFont(fontDict, loaded.context);
  const fontMetrics = resolveFontMetrics(fontDict, loaded.context, resolvedFont);
  // Edit only the SECOND (rotated) operator; the first (flat) one's own
  // bytes must come through completely unchanged.
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    formPath: null,
    operatorIndex: 1,
    operator: located[1].operator,
    replacementText: "Now edited vertical",
    resolvedFont,
    fontMetrics,
  });
  assert.equal(plan.editable, true, plan.reason ?? "");

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  assert.deepEqual(await extractPageStrings(editedBytes), ["Flat text", "Now edited vertical"]);

  const reloaded = await PDFDocument.load(editedBytes.slice());
  const relocated = collectPageTextOperators(reloaded, 0);
  assert.equal(relocated.length, 2);
  // The untouched flat operator's matrix must be exactly what it always was.
  assert.deepEqual(relocated[0].operator.textRenderingMatrix, located[0].operator.textRenderingMatrix);
  // The edited operator must still carry the same rotation as before.
  assert.deepEqual(relocated[1].operator.textRenderingMatrix.slice(0, 4), located[1].operator.textRenderingMatrix.slice(0, 4));
});
