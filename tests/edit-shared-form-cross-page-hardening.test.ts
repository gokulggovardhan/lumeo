// tests/edit-shared-form-cross-page-hardening.test.ts
//
// Phase 8 (production hardening, part 1): fixes a real, pre-existing bug
// in the DEFAULT (isolate: false) Form-XObject rewrite path, flagged as
// a follow-up while building tests/edit-shared-forms.test.ts (PR #204).
//
// Root cause: resolveStreamTarget's Form-XObject writeBack always did
// `context.delete(finalTargetRef)` after rewiring ONE parent dict's
// entry to the newly edited stream. That's safe when every invocation
// of the Form is reached through the SAME dict object (the existing
// "reused XObject" test in edit-form-xobjects.test.ts: one page, one
// Resources/XObject entry, invoked twice via two Do calls -- rewiring
// that single entry naturally covers both). It is NOT safe when the
// Form is reached through a SEPARATE dict object elsewhere (e.g. a
// shared header invoked from two different pages, each with its own
// Resources dict): only the page being edited gets its entry rewired;
// the other page's entry still says the SAME original ref -- which had
// just been deleted out from under it. After save + reload, that ref no
// longer resolves to anything, so the other page loses its Form XObject
// (and hence its own, unedited copy of the text) entirely.
//
// Fix: before deleting the original ref, re-check (via
// countDocumentFormXObjectInvocations, computed AFTER this one entry
// was already rewired above) whether anything else in the document
// still resolves to it. A count of zero means nothing else needs it --
// safe to delete exactly as before. A nonzero count means at least one
// other invocation site does, so it's deliberately left registered,
// untouched -- exactly the same non-deletion principle
// resolveIsolatedStreamTarget already uses for isolate: true, just
// applied to the default path too.
//
// This does NOT change what the default path's edit visually does for
// same-dict-object reuse (still edits every invocation there, unchanged
// -- see the last test here, mirroring the original Phase-4 case) --
// it only stops it from silently corrupting a document by deleting an
// object something else still needs.

import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { resolveFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import { buildEditPlan } from "../lib/pdf/edit/editPlan.ts";
import { applyEditPlanToDocument } from "../lib/pdf/edit/applyEditPlan.ts";

function hexOf(text: string): string {
  return Buffer.from(text, "ascii").toString("hex");
}

async function extractAllPageStrings(pdfBytes: Uint8Array): Promise<string[][]> {
  const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  const out: string[][] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out.push(content.items.map((item) => ("str" in item ? item.str : "")).filter((s) => s.length > 0));
  }
  return out;
}

function buildFormXObject(doc: PDFDocument, text: string) {
  const formFontDict = doc.context.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica", Encoding: "WinAnsiEncoding" });
  const formFontRef = doc.context.register(formFontDict);
  const resources = doc.context.obj({ Font: { FF1: formFontRef } });
  const formStream = doc.context.stream(`BT /FF1 16 Tf 10 10 Td <${hexOf(text)}> Tj ET`, {
    Type: "XObject",
    Subtype: "Form",
    BBox: [0, 0, 300, 40],
    Resources: resources,
  });
  return doc.context.register(formStream);
}

function buildTwoPageDocWithSharedHeader(headerText: string) {
  return async () => {
    const doc = await PDFDocument.create();
    const headerRef = buildFormXObject(doc, headerText);
    const page1 = doc.addPage([612, 792]);
    page1.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Hdr: headerRef }));
    page1.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 50 750 cm /Hdr Do Q")));
    const page2 = doc.addPage([612, 792]);
    page2.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Hdr: headerRef }));
    page2.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 50 750 cm /Hdr Do Q")));
    return { doc, headerRef };
  };
}

async function editFirstFormOperator(doc: PDFDocument, pageIndex: number, replacementText: string, isolate: boolean) {
  const located = collectPageTextOperators(doc, pageIndex);
  const target = located[0];
  assert.equal(target.locator.kind, "xobject");
  const fontDict = (target.resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict).lookup(PDFName.of("FF1"), PDFDict);
  const resolvedFont = resolveFont(fontDict, doc.context);
  const fontMetrics = resolveFontMetrics(fontDict, doc.context, resolvedFont);
  const plan = buildEditPlan({
    pageIndex,
    contentStreamIndex: 0,
    formPath: target.locator.kind === "xobject" ? target.locator.formPath : null,
    operatorIndex: 0,
    operator: target.operator,
    replacementText,
    resolvedFont,
    fontMetrics,
  });
  assert.equal(plan.editable, true, plan.reason ?? "");
  await applyEditPlanToDocument(doc, plan, resolvedFont.bytesPerCode, { isolate });
}

test("default (isolate: false) edit of a Form shared via a SEPARATE parent dict object no longer dangles the other page's reference", async () => {
  const { doc } = await buildTwoPageDocWithSharedHeader("Shared Header")();
  const original = await doc.save();
  assert.deepEqual(await extractAllPageStrings(original), [["Shared Header"], ["Shared Header"]]);

  const editedDoc = await PDFDocument.load(original.slice());
  await editFirstFormOperator(editedDoc, 0, "Changed On Page 1", false);
  const editedBytes = await editedDoc.save();

  // Page 1 shows the edit (the stream it now points at was rewritten).
  // Page 2 must still show ITS OWN text -- unedited, since its dict
  // entry was never touched -- not nothing, which is what the bug
  // produced (a dangling reference resolving to no content at all).
  assert.deepEqual(await extractAllPageStrings(editedBytes), [["Changed On Page 1"], ["Shared Header"]]);
});

test("the other page's Form XObject reference still resolves to a real, valid stream object after the edit (not dangling)", async () => {
  const { doc } = await buildTwoPageDocWithSharedHeader("Shared Header")();
  const original = await doc.save();

  const editedDoc = await PDFDocument.load(original.slice());
  await editFirstFormOperator(editedDoc, 0, "Changed On Page 1", false);
  const editedBytes = await editedDoc.save();

  const reloaded = await PDFDocument.load(editedBytes);
  const page2 = reloaded.getPages()[1];
  const xObjectDict = page2.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict) as PDFDict;
  const hdrEntry = xObjectDict.get(PDFName.of("Hdr"));
  assert.ok(hdrEntry, "page 2's Hdr entry must still exist");

  const resolved = reloaded.context.lookup(hdrEntry as import("pdf-lib").PDFRef);
  assert.ok(resolved instanceof PDFRawStream, "page 2's Hdr ref must resolve to a real stream, not dangle");
});

test("editing page 2 instead (the other direction) also leaves page 1's separate reference intact and valid", async () => {
  const { doc } = await buildTwoPageDocWithSharedHeader("Shared Header")();
  const original = await doc.save();

  const editedDoc = await PDFDocument.load(original.slice());
  await editFirstFormOperator(editedDoc, 1, "Changed On Page 2", false);
  const editedBytes = await editedDoc.save();

  assert.deepEqual(await extractAllPageStrings(editedBytes), [["Shared Header"], ["Changed On Page 2"]]);

  const reloaded = await PDFDocument.load(editedBytes);
  const page1 = reloaded.getPages()[0];
  const xObjectDict = page1.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict) as PDFDict;
  const hdrRef = xObjectDict.get(PDFName.of("Hdr"));
  const resolved = reloaded.context.lookup(hdrRef as import("pdf-lib").PDFRef);
  assert.ok(resolved instanceof PDFRawStream);
});

test("three pages sharing one Form via separate dicts: editing the middle page leaves the other two both intact and valid", async () => {
  const doc = await PDFDocument.create();
  const footerRef = buildFormXObject(doc, "Shared Footer");
  for (let i = 0; i < 3; i += 1) {
    const page = doc.addPage([612, 792]);
    page.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Ftr: footerRef }));
    page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 50 50 cm /Ftr Do Q")));
  }
  const original = await doc.save();
  assert.deepEqual(await extractAllPageStrings(original), [["Shared Footer"], ["Shared Footer"], ["Shared Footer"]]);

  const editedDoc = await PDFDocument.load(original.slice());
  await editFirstFormOperator(editedDoc, 1, "Middle Page Footer", false);
  const editedBytes = await editedDoc.save();

  assert.deepEqual(await extractAllPageStrings(editedBytes), [
    ["Shared Footer"],
    ["Middle Page Footer"],
    ["Shared Footer"],
  ]);
});

test("isolate: true is unaffected by this fix -- still clones and isolates exactly as before", async () => {
  const { doc } = await buildTwoPageDocWithSharedHeader("Shared Header")();
  const original = await doc.save();

  const editedDoc = await PDFDocument.load(original.slice());
  await editFirstFormOperator(editedDoc, 0, "Isolated Edit", true);
  const editedBytes = await editedDoc.save();

  assert.deepEqual(await extractAllPageStrings(editedBytes), [["Isolated Edit"], ["Shared Header"]]);
});

test("the original same-dict-object reuse case (Phase 4) still shows every invocation edited, unchanged by this fix", async () => {
  const doc = await PDFDocument.create();
  const stampRef = buildFormXObject(doc, "Shared Stamp");
  const page = doc.addPage([612, 792]);
  page.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Stamp: stampRef }));
  page.node.set(
    PDFName.of("Contents"),
    doc.context.register(doc.context.stream("q 1 0 0 1 50 700 cm /Stamp Do Q q 1 0 0 1 200 400 cm /Stamp Do Q")),
  );
  const original = await doc.save();
  assert.deepEqual(await extractAllPageStrings(original), [["Shared Stamp", "Shared Stamp"]]);

  const editedDoc = await PDFDocument.load(original.slice());
  await editFirstFormOperator(editedDoc, 0, "Changed Everywhere", false);
  const editedBytes = await editedDoc.save();

  assert.deepEqual(await extractAllPageStrings(editedBytes), [["Changed Everywhere", "Changed Everywhere"]]);
});
