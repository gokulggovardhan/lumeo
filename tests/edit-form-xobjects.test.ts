import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFDocument,
  PDFArray,
  PDFName,
  PDFDict,
  PDFHexString,
  StandardFonts,
  beginText,
  endText,
  setFontAndSize,
  moveText,
  showText,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { collectPageTextOperators, resolveStreamTarget, CyclicFormReferenceError } from "../lib/pdf/edit/formXObjects.ts";
import { resolveFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import { buildEditPlan } from "../lib/pdf/edit/editPlan.ts";
import { applyEditPlanToDocument } from "../lib/pdf/edit/applyEditPlan.ts";

function hexOf(text: string): string {
  return Buffer.from(text, "ascii").toString("hex");
}

async function extractPageStrings(pdfBytes: Uint8Array, pageNumber = 1): Promise<string[]> {
  const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).filter((str) => str.length > 0);
}

// Builds a minimal, self-contained Form XObject stream (its own font
// resource, its own text) and registers it, returning its ref. Mirrors
// this project's established hand-built-PDF-object approach (see e.g.
// tests/edit-content-stream.test.ts).
function buildFormXObject(
  doc: PDFDocument,
  text: string,
  options: { matrix?: number[]; nestedFormRef?: import("pdf-lib").PDFRef; nestedFormName?: string } = {},
) {
  const formFontDict = doc.context.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica", Encoding: "WinAnsiEncoding" });
  const formFontRef = doc.context.register(formFontDict);
  const hasNestedForm = Boolean(options.nestedFormRef && options.nestedFormName);
  const resources = doc.context.obj({
    Font: { FF1: formFontRef },
    ...(hasNestedForm ? { XObject: { [options.nestedFormName as string]: options.nestedFormRef } } : {}),
  });

  const contentParts = [`BT /FF1 16 Tf 10 10 Td <${hexOf(text)}> Tj ET`];
  if (hasNestedForm) {
    contentParts.push(`q 1 0 0 1 5 40 cm /${options.nestedFormName} Do Q`);
  }

  const formStream = doc.context.stream(contentParts.join("\n"), {
    Type: "XObject",
    Subtype: "Form",
    BBox: [0, 0, 200, 100],
    Resources: resources,
    ...(options.matrix ? { Matrix: options.matrix } : {}),
  });
  return doc.context.register(formStream);
}

test("multiple page content streams: text in a second, separately-registered stream is detected with its own contentStreamIndex", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.setFont(font);
  const fontKey = page.node.newFontDictionary(font.name, font.ref);

  page.pushOperators(beginText(), setFontAndSize(fontKey, 18), moveText(50, 700), showText(PDFHexString.of(hexOf("First stream"))), endText());
  const contentsAfterPush = page.node.get(PDFName.of("Contents")) as PDFArray;
  const firstStreamRef = contentsAfterPush.get(0);

  const secondStreamText = `BT /${fontKey.asString().replace(/^\//, "")} 18 Tf 50 650 Td <${hexOf("Second stream")}> Tj ET`;
  const secondStreamRef = doc.context.register(doc.context.stream(secondStreamText));
  page.node.set(PDFName.of("Contents"), doc.context.obj([firstStreamRef, secondStreamRef]));

  const bytes = await doc.save();
  const loaded = await PDFDocument.load(bytes.slice());
  const located = collectPageTextOperators(loaded, 0);

  assert.equal(located.length, 2);
  assert.deepEqual(
    located.map((item) => item.locator),
    [
      { kind: "page", contentStreamIndex: 0 },
      { kind: "page", contentStreamIndex: 1 },
    ],
  );
  assert.equal(Buffer.from(located[0].operator.strings[0]).toString("latin1"), "First stream");
  assert.equal(Buffer.from(located[1].operator.strings[0]).toString("latin1"), "Second stream");

  assert.deepEqual(await extractPageStrings(bytes), ["First stream", "Second stream"]);
});

test("Form XObject text is detected with an absolute (already-composed) rendering matrix, and can be edited via resolveStreamTarget", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const formRef = buildFormXObject(doc, "Original form text");
  const xObjectDict = doc.context.obj({ Fm1: formRef });
  page.node.Resources()!.set(PDFName.of("XObject"), xObjectDict);

  const pageContentText = "q 1 0 0 1 50 600 cm /Fm1 Do Q";
  page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream(pageContentText)));

  const original = await doc.save();
  assert.deepEqual(await extractPageStrings(original), ["Original form text"]);

  const loaded = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(loaded, 0);
  assert.equal(located.length, 1);
  assert.deepEqual(located[0].locator, { kind: "xobject", formPath: ["Fm1"] });
  // cm translates by (50,600); the form's own Td places text at (10,10) at
  // font size 16 -- so the absolute rendering matrix's translation must be
  // (60, 610), proving the composition (not just the form-local position).
  assert.equal(located[0].operator.textRenderingMatrix[4], 60);
  assert.equal(located[0].operator.textRenderingMatrix[5], 610);

  const resolvedFont = resolveFont(
    (located[0].resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict).lookup(PDFName.of("FF1"), PDFDict),
    loaded.context,
  );
  const fontMetrics = resolveFontMetrics(
    (located[0].resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict).lookup(PDFName.of("FF1"), PDFDict),
    loaded.context,
    resolvedFont,
  );
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    formPath: located[0].locator.kind === "xobject" ? located[0].locator.formPath : null,
    operatorIndex: 0,
    operator: located[0].operator,
    replacementText: "Edited form text",
    resolvedFont,
    fontMetrics,
  });
  assert.equal(plan.editable, true);
  assert.deepEqual(plan.formPath, ["Fm1"]);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  const reloaded = await PDFDocument.load(editedBytes.slice());
  assert.equal(reloaded.getPageCount(), 1);
  assert.deepEqual(await extractPageStrings(editedBytes), ["Edited form text"]);
});

test("nested Form XObjects: a Form invoking another Form is detected with a two-segment formPath and correctly composed absolute coordinates", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const innerFormRef = buildFormXObject(doc, "Inner form text");
  const outerFormRef = buildFormXObject(doc, "Outer form text", { nestedFormRef: innerFormRef, nestedFormName: "Fm2" });

  page.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Fm1: outerFormRef }));
  page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 50 600 cm /Fm1 Do Q")));

  const bytes = await doc.save();
  assert.deepEqual(await extractPageStrings(bytes), ["Outer form text", "Inner form text"]);

  const loaded = await PDFDocument.load(bytes.slice());
  const located = collectPageTextOperators(loaded, 0);
  assert.equal(located.length, 2);
  assert.deepEqual(located[0].locator, { kind: "xobject", formPath: ["Fm1"] });
  assert.deepEqual(located[1].locator, { kind: "xobject", formPath: ["Fm1", "Fm2"] });

  // Inner form invoked via "q 1 0 0 1 5 40 cm /Fm2 Do Q" inside Fm1, itself
  // placed via "q 1 0 0 1 50 600 cm /Fm1 Do Q" on the page -- so the
  // inner text's absolute position is (10+5+50, 10+40+600) = (65, 650).
  assert.equal(located[1].operator.textRenderingMatrix[4], 65);
  assert.equal(located[1].operator.textRenderingMatrix[5], 650);
});

test("reused XObject: the same Form invoked twice shows the same text at two different absolute positions, and editing it changes both (a shared stream, not a copy)", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const formRef = buildFormXObject(doc, "Shared stamp");
  page.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Fm1: formRef }));
  page.node.set(
    PDFName.of("Contents"),
    doc.context.register(doc.context.stream("q 1 0 0 1 50 600 cm /Fm1 Do Q q 1 0 0 1 200 400 cm /Fm1 Do Q")),
  );

  const original = await doc.save();
  assert.deepEqual(await extractPageStrings(original), ["Shared stamp", "Shared stamp"]);

  const loaded = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(loaded, 0);
  assert.equal(located.length, 2);
  // Both invocations resolve to the SAME formPath (the same underlying
  // Form resource, invoked from two different places) -- confirmed by two
  // different absolute positions for the identically-named path.
  assert.deepEqual(located[0].locator, { kind: "xobject", formPath: ["Fm1"] });
  assert.deepEqual(located[1].locator, { kind: "xobject", formPath: ["Fm1"] });
  assert.notDeepEqual(
    [located[0].operator.textRenderingMatrix[4], located[0].operator.textRenderingMatrix[5]],
    [located[1].operator.textRenderingMatrix[4], located[1].operator.textRenderingMatrix[5]],
  );

  const fontDict = (located[0].resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict).lookup(PDFName.of("FF1"), PDFDict);
  const resolvedFont = resolveFont(fontDict, loaded.context);
  const fontMetrics = resolveFontMetrics(fontDict, loaded.context, resolvedFont);
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    formPath: ["Fm1"],
    operatorIndex: 0,
    operator: located[0].operator,
    replacementText: "Changed stamp",
    resolvedFont,
    fontMetrics,
  });
  assert.equal(plan.editable, true);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  // Editing the SHARED Form's stream changes text at BOTH invocation
  // sites -- this is correct PDF semantics (a Form is like a stamp), not
  // a bug: there is only one underlying content stream.
  assert.deepEqual(await extractPageStrings(editedBytes), ["Changed stamp", "Changed stamp"]);
});

test("rotated Form XObject: a /Matrix baking in a 90-degree rotation still produces correct absolute coordinates and a correctly-editable, correctly-rendering result", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  // Matrix [0 1 -1 0 0 0]: a pure 90-degree rotation, no translation.
  const formRef = buildFormXObject(doc, "Rotated text", { matrix: [0, 1, -1, 0, 0, 0] });
  page.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Fm1: formRef }));
  page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 300 400 cm /Fm1 Do Q")));

  const original = await doc.save();
  assert.deepEqual(await extractPageStrings(original), ["Rotated text"]);

  const loaded = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(loaded, 0);
  assert.equal(located.length, 1);
  // formMatrix=[0,1,-1,0,0,0] rotates the form-local point (10,10) to
  // (-10,10) before the outer cm's (300,400) translation is applied --
  // proving the rotation was genuinely applied, not ignored.
  assert.equal(located[0].operator.textRenderingMatrix[4], 300 - 10);
  assert.equal(located[0].operator.textRenderingMatrix[5], 400 + 10);
  // The rotation's off-diagonal components must also survive into the
  // combined matrix (0 and 16, not the unrotated 16 and 0).
  assert.equal(located[0].operator.textRenderingMatrix[0], 0);
  assert.equal(located[0].operator.textRenderingMatrix[1], 16);

  const fontDict = (located[0].resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict).lookup(PDFName.of("FF1"), PDFDict);
  const resolvedFont = resolveFont(fontDict, loaded.context);
  const fontMetrics = resolveFontMetrics(fontDict, loaded.context, resolvedFont);
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    formPath: ["Fm1"],
    operatorIndex: 0,
    operator: located[0].operator,
    replacementText: "Still rotated",
    resolvedFont,
    fontMetrics,
  });
  assert.equal(plan.editable, true);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();
  assert.deepEqual(await extractPageStrings(editedBytes), ["Still rotated"]);
});

test("clipped text: a Form containing a clipping path (W n) around its text is still correctly detected and edited", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);

  const formFontDict = doc.context.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica", Encoding: "WinAnsiEncoding" });
  const formFontRef = doc.context.register(formFontDict);
  const resources = doc.context.obj({ Font: { FF1: formFontRef } });
  // A rectangular clip path (re ... W n) established before the text --
  // must not confuse the tokenizer/walker, which should simply ignore
  // path-construction/clipping operators it doesn't specifically track.
  const contentText = `q 0 0 100 50 re W n BT /FF1 16 Tf 10 10 Td <${hexOf("Clipped text")}> Tj ET Q`;
  const formStream = doc.context.stream(contentText, { Type: "XObject", Subtype: "Form", BBox: [0, 0, 200, 100], Resources: resources });
  const formRef = doc.context.register(formStream);

  page.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Fm1: formRef }));
  page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 50 600 cm /Fm1 Do Q")));

  const original = await doc.save();
  assert.deepEqual(await extractPageStrings(original), ["Clipped text"]);

  const loaded = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(loaded, 0);
  assert.equal(located.length, 1);
  assert.equal(Buffer.from(located[0].operator.strings[0]).toString("latin1"), "Clipped text");

  const fontDict = (located[0].resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict).lookup(PDFName.of("FF1"), PDFDict);
  const resolvedFont = resolveFont(fontDict, loaded.context);
  const fontMetrics = resolveFontMetrics(fontDict, loaded.context, resolvedFont);
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    formPath: ["Fm1"],
    operatorIndex: 0,
    operator: located[0].operator,
    replacementText: "Edited clipped",
    resolvedFont,
    fontMetrics,
  });
  assert.equal(plan.editable, true);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();
  assert.deepEqual(await extractPageStrings(editedBytes), ["Edited clipped"]);
});

test("a Form XObject that invokes itself is rejected with CyclicFormReferenceError, not an infinite loop or crash", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const formStream = doc.context.stream("/Fm1 Do", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 100, 100] });
  const formRef = doc.context.register(formStream);
  page.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Fm1: formRef }));
  page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("/Fm1 Do")));

  const bytes = await doc.save();
  const loaded = await PDFDocument.load(bytes.slice());
  assert.throws(() => collectPageTextOperators(loaded, 0), CyclicFormReferenceError);
});

test("an Image XObject (Subtype /Image, not /Form) invoked via Do is correctly skipped, not mistaken for a Form", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.setFont(font);
  const fontKey = page.node.newFontDictionary(font.name, font.ref);

  // A fake (non-decodable, doesn't matter -- never rendered) Image XObject.
  const imageStream = doc.context.stream(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
    Type: "XObject",
    Subtype: "Image",
    Width: 1,
    Height: 1,
    ColorSpace: "DeviceGray",
    BitsPerComponent: 8,
  });
  const imageRef = doc.context.register(imageStream);
  page.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Im1: imageRef }));

  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(50, 0, 0, 50, 50, 50),
    popGraphicsState(),
    beginText(),
    setFontAndSize(fontKey, 18),
    moveText(50, 700),
    showText(PDFHexString.of(hexOf("Real text"))),
    endText(),
  );

  const bytes = await doc.save();
  const loaded = await PDFDocument.load(bytes.slice());
  const located = collectPageTextOperators(loaded, 0);
  assert.equal(located.length, 1);
  assert.equal(Buffer.from(located[0].operator.strings[0]).toString("latin1"), "Real text");
});

test("shared Form XObject reused across two pages' SEPARATE Resources/XObject dicts: editing via the default (isolate: false) path must not leave the other page's entry dangling", async () => {
  const doc = await PDFDocument.create();
  const formRef = buildFormXObject(doc, "Shared header");

  const page1 = doc.addPage([612, 792]);
  page1.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Fm1: formRef }));
  page1.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 50 600 cm /Fm1 Do Q")));

  const page2 = doc.addPage([612, 792]);
  // A SEPARATE dict object (not the same one page1 uses) that also
  // happens to point at the same underlying Form ref -- the real-world
  // shape (two pages each with their own Resources) that the shared
  // single-dict "reused XObject" test above does not cover.
  page2.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj({ Fm1: formRef }));
  page2.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 50 600 cm /Fm1 Do Q")));

  const original = await doc.save();
  assert.deepEqual(await extractPageStrings(original, 1), ["Shared header"]);
  assert.deepEqual(await extractPageStrings(original, 2), ["Shared header"]);

  const loaded = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(loaded, 0);
  assert.equal(located.length, 1);
  assert.deepEqual(located[0].locator, { kind: "xobject", formPath: ["Fm1"] });

  const fontDict = (located[0].resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict).lookup(PDFName.of("FF1"), PDFDict);
  const resolvedFont = resolveFont(fontDict, loaded.context);
  const fontMetrics = resolveFontMetrics(fontDict, loaded.context, resolvedFont);
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    formPath: ["Fm1"],
    operatorIndex: 0,
    operator: located[0].operator,
    replacementText: "Edited header",
    resolvedFont,
    fontMetrics,
  });
  assert.equal(plan.editable, true);

  const editedDoc = await PDFDocument.load(original.slice());
  // Default path (isolate: false, unchanged behavior) only repoints
  // page 1's OWN dict entry to the edited stream -- page 2's separate
  // dict entry still points at the untouched original ref. The bug
  // this guards against is NOT "page 2 doesn't get the edit" (that's
  // simply how this path works without isolate: true); it's that the
  // original ref used to get deleted out from under page 2 regardless,
  // breaking its Form XObject reference entirely (empty text, not just
  // unedited text).
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  const reloaded = await PDFDocument.load(editedBytes.slice());
  assert.equal(reloaded.getPageCount(), 2);
  assert.deepEqual(await extractPageStrings(editedBytes, 1), ["Edited header"]);
  assert.deepEqual(await extractPageStrings(editedBytes, 2), ["Shared header"]);
});

test("resolveStreamTarget for a page-level (non-Form) location matches the plain contentStreamIndex path exactly", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.setFont(font);
  const fontKey = page.node.newFontDictionary(font.name, font.ref);
  page.pushOperators(beginText(), setFontAndSize(fontKey, 18), moveText(50, 700), showText(PDFHexString.of(hexOf("Hi"))), endText());

  const bytes = await doc.save();
  const loaded = await PDFDocument.load(bytes.slice());
  const target = resolveStreamTarget(loaded, 0, 0, null);
  const text = Buffer.from(target.decodedBytes).toString("latin1");
  assert.match(text, /Tj/);
});
