// tests/edit-clipped-text.test.ts
//
// Phase 4 of true PDF text editing (clipping-path slice): a clipping
// path is established by path-construction operators (re/m/l/c/...)
// followed by W or W* then a path-painting no-op (n) -- none of which
// lib/pdf/edit/contentStream.ts's walkTextShowOperators tracks or acts
// on (they fall through its switch's `default: break`). A rewrite only
// ever replaces a Tj/TJ/'/" operator's own string bytes, never any
// clip-establishing operator, so an active clip (rectangular, nested,
// even-odd, or combined with rotation) is preserved automatically, by
// construction -- exactly like rotation (see edit-rotated-text.test.ts).
//
// The one genuine new safety case this slice adds: PDF spec 9.3.3's
// text-rendering modes 4-7 make the text ITSELF define (part of) the
// clipping path (applied at ET). Editing such text would change what
// later content is clipped to, not just its own glyphs -- a
// fundamentally different, higher-blast-radius edit -- so
// lib/pdf/edit/editPlan.ts now rejects it honestly (editable: false)
// rather than attempting it. That's the only production-code change in
// this slice; every other clip scenario below already worked with no
// code change.

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

async function buildPage(content: string) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.node.Resources()!.set(PDFName.of("Font"), doc.context.obj({ F1: font.ref }));
  page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream(content)));
  return doc.save();
}

async function editFirstOperator(originalBytes: Uint8Array, replacementText: string) {
  const loaded = await PDFDocument.load(originalBytes.slice());
  const located = collectPageTextOperators(loaded, 0);
  assert.ok(located.length > 0, "expected at least one text-show operator");

  const fontDict = (located[0].resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict).lookup(PDFName.of("F1"), PDFDict);
  const resolvedFont = resolveFont(fontDict, loaded.context);
  const fontMetrics = resolveFontMetrics(fontDict, loaded.context, resolvedFont);
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    formPath: null,
    operatorIndex: 0,
    operator: located[0].operator,
    replacementText,
    resolvedFont,
    fontMetrics,
  });
  return { plan, located, editedBytes: plan.editable ? await (async () => {
    const editedDoc = await PDFDocument.load(originalBytes.slice());
    await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
    return editedDoc.save();
  })() : null };
}

test("rectangular clip: text inside a re/W/n clip is detected, edited, and the clip operators are byte-preserved", async () => {
  const content = "q 50 50 200 100 re W n BT /F1 20 Tf 60 60 Td (Clipped rect) Tj ET Q";
  const original = await buildPage(content);
  assert.deepEqual(await extractPageStrings(original), ["Clipped rect"]);

  const { plan, editedBytes } = await editFirstOperator(original, "Edited rect clip");
  assert.equal(plan.editable, true, plan.reason ?? "");
  assert.deepEqual(await extractPageStrings(editedBytes!), ["Edited rect clip"]);

  const editedText = Buffer.from(editedBytes!).toString("latin1");
  assert.match(editedText, /50 50 200 100 re W n/, "clip-establishing operators must survive byte-for-byte");
});

test("nested clip: an inner clip inside an outer clip (two q/re/W/n levels) is preserved and its text is editable", async () => {
  const content = "q 0 0 400 400 re W n q 50 50 200 100 re W n BT /F1 20 Tf 60 60 Td (Nested clip text) Tj ET Q Q";
  const original = await buildPage(content);
  assert.deepEqual(await extractPageStrings(original), ["Nested clip text"]);

  const { plan, editedBytes } = await editFirstOperator(original, "Edited nested clip");
  assert.equal(plan.editable, true, plan.reason ?? "");
  assert.deepEqual(await extractPageStrings(editedBytes!), ["Edited nested clip"]);

  const editedText = Buffer.from(editedBytes!).toString("latin1");
  assert.match(editedText, /0 0 400 400 re W n/);
  assert.match(editedText, /50 50 200 100 re W n/);
});

test("even-odd clip (W*): text inside a W*-established clip is detected and editable", async () => {
  const content = "q 50 50 200 100 re W* n BT /F1 20 Tf 60 60 Td (Evenodd clip) Tj ET Q";
  const original = await buildPage(content);
  assert.deepEqual(await extractPageStrings(original), ["Evenodd clip"]);

  const { plan, editedBytes } = await editFirstOperator(original, "Edited evenodd");
  assert.equal(plan.editable, true, plan.reason ?? "");
  assert.deepEqual(await extractPageStrings(editedBytes!), ["Edited evenodd"]);
});

test("rotated clipped text: a clip combined with a rotated cm still detects and edits correctly", async () => {
  const content = "q 50 50 300 300 re W n 0.800000 0.600000 -0.600000 0.800000 100 100 cm BT /F1 20 Tf 10 10 Td (Rotated clipped) Tj ET Q";
  const original = await buildPage(content);
  assert.deepEqual(await extractPageStrings(original), ["Rotated clipped"]);

  const loaded = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(loaded, 0);
  const [a, b] = located[0].operator.textRenderingMatrix;
  assert.ok(Math.abs(a) > 1e-6 && Math.abs(b) > 1e-6, "expected the rotation to be present in the rendering matrix");

  const { plan, editedBytes } = await editFirstOperator(original, "Still rotated and clipped");
  assert.equal(plan.editable, true, plan.reason ?? "");
  assert.deepEqual(await extractPageStrings(editedBytes!), ["Still rotated and clipped"]);
});

test("mixed clipped and non-clipped text on the same page: editing the clipped run leaves the unclipped one untouched", async () => {
  const content = [
    "BT /F1 20 Tf 50 700 Td (Unclipped text) Tj ET",
    "q 50 50 200 100 re W n BT /F1 20 Tf 60 60 Td (Clipped text) Tj ET Q",
  ].join("\n");
  const original = await buildPage(content);
  assert.deepEqual(await extractPageStrings(original), ["Unclipped text", "Clipped text"]);

  const loaded = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(loaded, 0);
  assert.equal(located.length, 2);

  const fontDict = (located[1].resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict).lookup(PDFName.of("F1"), PDFDict);
  const resolvedFont = resolveFont(fontDict, loaded.context);
  const fontMetrics = resolveFontMetrics(fontDict, loaded.context, resolvedFont);
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    formPath: null,
    operatorIndex: 1,
    operator: located[1].operator,
    replacementText: "Now edited clipped",
    resolvedFont,
    fontMetrics,
  });
  assert.equal(plan.editable, true, plan.reason ?? "");

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  assert.deepEqual(await extractPageStrings(editedBytes), ["Unclipped text", "Now edited clipped"]);
});

for (const renderMode of [4, 5, 6, 7]) {
  test(`text-rendering mode ${renderMode} (participates in the clipping path) is honestly rejected, not silently edited`, async () => {
    const content = `q BT /F1 20 Tf ${renderMode} Tr 60 60 Td (Clip-defining text) Tj ET Q`;
    const original = await buildPage(content);

    const loaded = await PDFDocument.load(original.slice());
    const located = collectPageTextOperators(loaded, 0);
    assert.equal(located.length, 1);
    assert.equal(located[0].operator.renderMode, renderMode);

    const fontDict = (located[0].resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict).lookup(PDFName.of("F1"), PDFDict);
    const resolvedFont = resolveFont(fontDict, loaded.context);
    const fontMetrics = resolveFontMetrics(fontDict, loaded.context, resolvedFont);
    const plan = buildEditPlan({
      pageIndex: 0,
      contentStreamIndex: 0,
      formPath: null,
      operatorIndex: 0,
      operator: located[0].operator,
      replacementText: "Should not apply",
      resolvedFont,
      fontMetrics,
    });
    assert.equal(plan.editable, false);
    assert.match(plan.reason ?? "", /clipping path/);
  });
}

test("text-rendering mode 0 (plain fill, not clip-related) remains editable", async () => {
  const content = "BT /F1 20 Tf 0 Tr 60 60 Td (Normal fill text) Tj ET";
  const original = await buildPage(content);
  const { plan } = await editFirstOperator(original, "Edited normal fill");
  assert.equal(plan.editable, true, plan.reason ?? "");
});
