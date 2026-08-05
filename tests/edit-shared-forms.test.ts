// tests/edit-shared-forms.test.ts
//
// Phase 4 of true PDF text editing (shared Form XObject slice): a Form
// XObject is a single underlying stream object that can be invoked
// (`Do`) from many places -- multiple pages (a repeated header/footer/
// logo), or nested inside another Form. By default,
// applyEditPlanToDocument mutates that ONE shared stream directly, so
// editing it changes every invocation site at once -- correct PDF
// semantics (a Form is a stamp), already proven in
// edit-form-xobjects.test.ts's "reused XObject" test, and left
// completely unchanged by this slice.
//
// This slice adds an OPT-IN alternative: applyEditPlanToDocument(doc,
// plan, bytesPerCode, { isolate: true }). When the target Form is
// actually shared elsewhere, it clones the Form (registering the clone
// under the SAME resource name, in the SAME parent dict object this one
// invocation path resolved through) so only THIS invocation is edited;
// every other invocation site -- reached through a different parent
// dict entirely -- keeps pointing at the original, untouched Form. A
// Form that isn't shared anywhere else needs no clone at all (verified
// below: no "_isolated"/extra XObject entries are created for it).
//
// Two situations can't be safely isolated and are rejected honestly
// (AmbiguousSharedFormError) rather than attempted:
// - the SAME resource name is invoked more than once within one
//   immediate parent stream (would need rewriting a Do operand, which
//   this engine doesn't do);
// - the immediate parent Form is itself shared (isolating through a
//   chain of shared ancestors is out of scope for this slice).

import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  collectPageTextOperators,
  countDocumentFormXObjectInvocations,
  AmbiguousSharedFormError,
} from "../lib/pdf/edit/formXObjects.ts";
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

test("reused header: isolated edit of page 1's header leaves page 2's identical header untouched", async () => {
  const doc = await PDFDocument.create();
  const headerRef = buildFormXObject(doc, "Shared Header");
  const page1 = doc.addPage([612, 792]);
  page1.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Hdr: headerRef }));
  page1.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 50 750 cm /Hdr Do Q")));
  const page2 = doc.addPage([612, 792]);
  page2.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Hdr: headerRef }));
  page2.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 50 750 cm /Hdr Do Q")));

  const original = await doc.save();
  assert.deepEqual(await extractAllPageStrings(original), [["Shared Header"], ["Shared Header"]]);

  const reuseCounts = countDocumentFormXObjectInvocations(await PDFDocument.load(original.slice()));
  assert.equal(reuseCounts.get(headerRef), 2);

  const editedDoc = await PDFDocument.load(original.slice());
  await editFirstFormOperator(editedDoc, 0, "Page 1 Header Only", true);
  const editedBytes = await editedDoc.save();

  assert.deepEqual(await extractAllPageStrings(editedBytes), [["Page 1 Header Only"], ["Shared Header"]]);
});

test("reused footer: isolated edit of page 2's footer leaves page 1's identical footer untouched", async () => {
  const doc = await PDFDocument.create();
  const footerRef = buildFormXObject(doc, "Shared Footer");
  const page1 = doc.addPage([612, 792]);
  page1.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Ftr: footerRef }));
  page1.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 50 50 cm /Ftr Do Q")));
  const page2 = doc.addPage([612, 792]);
  page2.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Ftr: footerRef }));
  page2.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 50 50 cm /Ftr Do Q")));

  const original = await doc.save();
  assert.deepEqual(await extractAllPageStrings(original), [["Shared Footer"], ["Shared Footer"]]);

  const editedDoc = await PDFDocument.load(original.slice());
  await editFirstFormOperator(editedDoc, 1, "Page 2 Footer Only", true);
  const editedBytes = await editedDoc.save();

  assert.deepEqual(await extractAllPageStrings(editedBytes), [["Shared Footer"], ["Page 2 Footer Only"]]);
});

test("repeated logo across three pages: isolating the middle page's logo leaves the other two untouched", async () => {
  const doc = await PDFDocument.create();
  const logoRef = buildFormXObject(doc, "Logo");
  const pages = [0, 1, 2].map(() => {
    const page = doc.addPage([612, 792]);
    page.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Logo: logoRef }));
    page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 50 750 cm /Logo Do Q")));
    return page;
  });
  assert.equal(pages.length, 3);

  const original = await doc.save();
  assert.deepEqual(await extractAllPageStrings(original), [["Logo"], ["Logo"], ["Logo"]]);

  const editedDoc = await PDFDocument.load(original.slice());
  await editFirstFormOperator(editedDoc, 1, "Middle Page Logo", true);
  const editedBytes = await editedDoc.save();

  assert.deepEqual(await extractAllPageStrings(editedBytes), [["Logo"], ["Middle Page Logo"], ["Logo"]]);
});

test("nested reused Form: a Form invoked both directly from the page and from inside another Form -- isolating the direct invocation leaves the nested one untouched", async () => {
  const doc = await PDFDocument.create();
  const logoRef = buildFormXObject(doc, "Logo");
  const headerFontDict = doc.context.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica", Encoding: "WinAnsiEncoding" });
  const headerFontRef = doc.context.register(headerFontDict);
  const headerRef = doc.context.register(
    doc.context.stream("q 1 0 0 1 5 5 cm /Logo Do Q", {
      Type: "XObject",
      Subtype: "Form",
      BBox: [0, 0, 300, 60],
      Resources: doc.context.obj({ Font: { FF1: headerFontRef }, XObject: { Logo: logoRef } }),
    }),
  );

  const page = doc.addPage([612, 792]);
  page.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Header: headerRef, Logo: logoRef }));
  page.node.set(
    PDFName.of("Contents"),
    doc.context.register(doc.context.stream("q 1 0 0 1 50 700 cm /Header Do Q q 1 0 0 1 400 400 cm /Logo Do Q")),
  );

  const original = await doc.save();
  assert.deepEqual(await extractAllPageStrings(original), [["Logo", "Logo"]]);

  const editedDoc = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(editedDoc, 0);
  const directLogo = located.find((l) => l.locator.kind === "xobject" && l.locator.formPath.length === 1);
  assert.ok(directLogo);

  const fontDict = (directLogo!.resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict).lookup(PDFName.of("FF1"), PDFDict);
  const resolvedFont = resolveFont(fontDict, editedDoc.context);
  const fontMetrics = resolveFontMetrics(fontDict, editedDoc.context, resolvedFont);
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    formPath: ["Logo"],
    operatorIndex: 0,
    operator: directLogo!.operator,
    replacementText: "Page-level Logo Only",
    resolvedFont,
    fontMetrics,
  });
  assert.equal(plan.editable, true, plan.reason ?? "");
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode, { isolate: true });
  const editedBytes = await editedDoc.save();

  // First item is the Header's OWN nested Logo invocation (unchanged);
  // second is the page's direct Logo invocation (edited).
  assert.deepEqual(await extractAllPageStrings(editedBytes), [["Logo", "Page-level Logo Only"]]);
});

test("mixed unique and shared Forms on one page: isolating the shared one clones it; the unique one is edited in place with no clone", async () => {
  const doc = await PDFDocument.create();
  const sharedRef = buildFormXObject(doc, "Shared Banner");
  const uniqueRef = buildFormXObject(doc, "Unique Note");

  const page1 = doc.addPage([612, 792]);
  page1.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Banner: sharedRef, Note: uniqueRef }));
  page1.node.set(
    PDFName.of("Contents"),
    doc.context.register(doc.context.stream("q 1 0 0 1 50 750 cm /Banner Do Q q 1 0 0 1 50 100 cm /Note Do Q")),
  );
  const page2 = doc.addPage([612, 792]);
  page2.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Banner: sharedRef }));
  page2.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 50 750 cm /Banner Do Q")));

  const original = await doc.save();
  assert.deepEqual(await extractAllPageStrings(original), [["Shared Banner", "Unique Note"], ["Shared Banner"]]);

  const editedDoc = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(editedDoc, 0);
  assert.equal(located.length, 2);

  for (const target of located) {
    assert.equal(target.locator.kind, "xobject");
    const formPath = target.locator.kind === "xobject" ? target.locator.formPath : null;
    const isBanner = formPath?.[0] === "Banner";
    const fontDict = (target.resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict).lookup(PDFName.of("FF1"), PDFDict);
    const resolvedFont = resolveFont(fontDict, editedDoc.context);
    const fontMetrics = resolveFontMetrics(fontDict, editedDoc.context, resolvedFont);
    const plan = buildEditPlan({
      pageIndex: 0,
      contentStreamIndex: 0,
      formPath,
      operatorIndex: 0,
      operator: target.operator,
      replacementText: isBanner ? "Edited Banner (page 1 only)" : "Edited Note",
      resolvedFont,
      fontMetrics,
    });
    assert.equal(plan.editable, true, plan.reason ?? "");
    await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode, { isolate: true });
  }

  const editedBytes = await editedDoc.save();
  assert.deepEqual(await extractAllPageStrings(editedBytes), [
    ["Edited Banner (page 1 only)", "Edited Note"],
    ["Shared Banner"],
  ]);

  // The unique Note must have been edited WITHOUT cloning -- no extra
  // XObject resource entries were created for it.
  const savedText = Buffer.from(editedBytes).toString("latin1");
  assert.ok(!savedText.includes("Note_isolated"), "unique Form should not have been cloned");
});

test("same resource name invoked twice within one parent stream is rejected honestly, not silently mutated or mis-isolated", async () => {
  const doc = await PDFDocument.create();
  const stampRef = buildFormXObject(doc, "Stamp");
  const page = doc.addPage([612, 792]);
  page.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Stamp: stampRef }));
  page.node.set(
    PDFName.of("Contents"),
    doc.context.register(doc.context.stream("q 1 0 0 1 50 600 cm /Stamp Do Q q 1 0 0 1 200 400 cm /Stamp Do Q")),
  );
  const original = await doc.save();
  const editedDoc = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(editedDoc, 0);
  const fontDict = (located[0].resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict).lookup(PDFName.of("FF1"), PDFDict);
  const resolvedFont = resolveFont(fontDict, editedDoc.context);
  const fontMetrics = resolveFontMetrics(fontDict, editedDoc.context, resolvedFont);
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    formPath: ["Stamp"],
    operatorIndex: 0,
    operator: located[0].operator,
    replacementText: "Changed",
    resolvedFont,
    fontMetrics,
  });
  await assert.rejects(
    () => applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode, { isolate: true }),
    AmbiguousSharedFormError,
  );
});

test("a shared immediate-parent Form (cascading reuse) is rejected honestly rather than isolated incorrectly", async () => {
  const doc = await PDFDocument.create();
  const eRef = buildFormXObject(doc, "E text");
  const bRef = doc.context.register(
    doc.context.stream("q 1 0 0 1 5 5 cm /E Do Q", {
      Type: "XObject",
      Subtype: "Form",
      BBox: [0, 0, 300, 60],
      Resources: doc.context.obj({ XObject: { E: eRef } }),
    }),
  );
  const page1 = doc.addPage([612, 792]);
  page1.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ B: bRef }));
  page1.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 50 700 cm /B Do Q")));
  const page2 = doc.addPage([612, 792]);
  page2.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ B: bRef }));
  page2.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 50 700 cm /B Do Q")));

  const original = await doc.save();
  const editedDoc = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(editedDoc, 0);
  const fontDict = (located[0].resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict).lookup(PDFName.of("FF1"), PDFDict);
  const resolvedFont = resolveFont(fontDict, editedDoc.context);
  const fontMetrics = resolveFontMetrics(fontDict, editedDoc.context, resolvedFont);
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    formPath: ["B", "E"],
    operatorIndex: 0,
    operator: located[0].operator,
    replacementText: "Changed E",
    resolvedFont,
    fontMetrics,
  });
  await assert.rejects(
    () => applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode, { isolate: true }),
    AmbiguousSharedFormError,
  );
});

test("isolate: false (default) preserves the existing shared-edit-affects-every-invocation behavior exactly", async () => {
  // Same shape as edit-form-xobjects.test.ts's already-merged "reused
  // XObject" test (PR #201): ONE page, ONE Resources/XObject dict entry,
  // invoked twice -- updating that single entry covers both invocations
  // safely. (A shared Form reached through SEPARATE dict objects, e.g.
  // different pages each with their own Resources dict, is a distinct,
  // pre-existing gap in this default path -- see task_b6dac158 -- and is
  // exactly what isolate: true exists to handle correctly instead.)
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
