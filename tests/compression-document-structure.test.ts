import assert from "node:assert/strict";
import test from "node:test";
import { PDFDict, PDFDocument, PDFName, PDFRef, PDFString, degrees, StandardFonts, type PDFContext } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

// Mirrors CompressPdfTool.tsx's copyOutlineItem/copyOutline exactly (that
// file is a "use client" component with canvas/pdfjs dependencies that
// don't run under Node -- this project's established convention for
// testing browser-only logic is either a source-string presence check or,
// where the logic is pure enough, a real mirrored re-implementation like
// this one, which is stronger evidence than a string check since it's
// actually executed).
function copyOutlineItem(sourceContext: PDFContext, output: PDFDocument, sourceItemDict: PDFDict): PDFRef {
  const newDict = output.context.obj({});
  const title = sourceItemDict.get(PDFName.of("Title"));
  if (title) newDict.set(PDFName.of("Title"), title.clone());
  const newRef = output.context.register(newDict);

  let previousChildRef: PDFRef | undefined;
  let firstChildRef: PDFRef | undefined;
  let sourceChildRef = sourceItemDict.get(PDFName.of("First"));
  let childCount = 0;

  while (sourceChildRef instanceof PDFRef) {
    const sourceChildDict = sourceContext.lookup(sourceChildRef, PDFDict);
    const copiedChildRef = copyOutlineItem(sourceContext, output, sourceChildDict);
    const copiedChildDict = output.context.lookup(copiedChildRef, PDFDict);
    copiedChildDict.set(PDFName.of("Parent"), newRef);
    childCount += 1;

    if (!firstChildRef) firstChildRef = copiedChildRef;
    if (previousChildRef) {
      const previousChildDict = output.context.lookup(previousChildRef, PDFDict);
      previousChildDict.set(PDFName.of("Next"), copiedChildRef);
      copiedChildDict.set(PDFName.of("Prev"), previousChildRef);
    }
    previousChildRef = copiedChildRef;
    sourceChildRef = sourceChildDict.get(PDFName.of("Next"));
  }

  if (firstChildRef) newDict.set(PDFName.of("First"), firstChildRef);
  if (previousChildRef) newDict.set(PDFName.of("Last"), previousChildRef);
  if (childCount > 0) newDict.set(PDFName.of("Count"), output.context.obj(childCount));

  return newRef;
}

function copyOutline(source: PDFDocument, output: PDFDocument) {
  const outlinesRef = source.catalog.get(PDFName.of("Outlines"));
  if (!(outlinesRef instanceof PDFRef)) return;
  const sourceOutlineDict = source.context.lookup(outlinesRef, PDFDict);
  const copiedRootRef = copyOutlineItem(source.context, output, sourceOutlineDict);
  const copiedRootDict = output.context.lookup(copiedRootRef, PDFDict);
  copiedRootDict.set(PDFName.of("Type"), PDFName.of("Outlines"));
  output.catalog.set(PDFName.of("Outlines"), copiedRootRef);
}

// Simulates buildCompressedCandidate's actual pipeline for a text page:
// a fresh output document, copyMetadata's title/author copy, copyOutline,
// then copyPages for every page -- exactly what CompressPdfTool.tsx does,
// without pulling in its full component (canvas/pdfjs deps that don't run
// under Node).
async function copyDocumentLikeCompressDoes(source: PDFDocument) {
  const output = await PDFDocument.create();
  output.setTitle(source.getTitle() || "Compressed PDF");
  const author = source.getAuthor();
  if (author) output.setAuthor(author);
  copyOutline(source, output);

  const pageCount = source.getPageCount();
  for (let i = 0; i < pageCount; i += 1) {
    const [copied] = await output.copyPages(source, [i]);
    output.addPage(copied);
  }
  copyAcroForm(output);
  return output;
}

// Mirrors CompressPdfTool.tsx's copyAcroForm exactly. copyPages already
// carries each field's widget annotation across as part of the page's
// /Annots, but never registers the catalog-level /AcroForm entry a viewer
// needs to recognize those widgets as an actual fillable form -- without it
// a compressed form's fields are still visually drawn but dead. Walks the
// already-copied pages' own /Annots for Subtype /Widget entries and, for
// each, walks its /Parent chain up to the true root field (a widget does
// not necessarily carry /FT itself -- a dotted field name like
// "applicant.name" makes pdf-lib build a two-level /Parent hierarchy, and
// /AcroForm.Fields must list only the true root, not an intermediate or
// the widget itself).
function copyAcroForm(output: PDFDocument) {
  const rootRefs: PDFRef[] = [];
  const seenRoots = new Set<string>();

  for (const page of output.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let index = 0; index < annots.size(); index += 1) {
      const annotRef = annots.get(index);
      if (!(annotRef instanceof PDFRef)) continue;
      const annotDict = output.context.lookup(annotRef, PDFDict);
      const subtype = annotDict.get(PDFName.of("Subtype"));
      if (!(subtype instanceof PDFName) || subtype.asString() !== "/Widget") continue;

      let rootRef = annotRef;
      let rootDict = annotDict;
      while (rootDict.has(PDFName.of("Parent"))) {
        const parentRef = rootDict.get(PDFName.of("Parent"));
        if (!(parentRef instanceof PDFRef)) break;
        rootRef = parentRef;
        rootDict = output.context.lookup(parentRef, PDFDict);
      }

      const key = rootRef.toString();
      if (!seenRoots.has(key)) {
        seenRoots.add(key);
        rootRefs.push(rootRef);
      }
    }
  }
  if (rootRefs.length === 0) return;

  const newAcroForm = output.context.obj({
    Fields: rootRefs,
    NeedAppearances: true,
  });
  const newAcroFormRef = output.context.register(newAcroForm);
  output.catalog.set(PDFName.of("AcroForm"), newAcroFormRef);
}

// pdf-lib has no high-level bookmark/outline API, so this builds the
// minimal real /Outlines structure by hand (a document-level catalog entry,
// not part of any page) -- the same shape a real PDF with a bookmark panel
// has. Optionally attaches a /Dest pointing at a specific page, the exact
// shape that caused the orphaned-page-duplicate bug this file tests for.
async function buildDocumentWithOutline(options: { withDestToSecondPage?: boolean } = {}) {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  const secondPage = doc.addPage([200, 200]);

  const context = doc.context;
  const outlineItemDict = context.obj({
    Title: PDFString.of("Chapter 1"),
    ...(options.withDestToSecondPage
      ? { Dest: [secondPage.ref, PDFName.of("XYZ"), null, null, null] }
      : {}),
  });
  const outlineItemRef = context.register(outlineItemDict);
  const outlineRootDict = context.obj({
    Type: PDFName.of("Outlines"),
    First: outlineItemRef,
    Last: outlineItemRef,
    Count: 1,
  });
  const outlineRootRef = context.register(outlineRootDict);
  outlineItemDict.set(PDFName.of("Parent"), outlineRootRef);
  doc.catalog.set(PDFName.of("Outlines"), outlineRootRef);

  return doc;
}

test("copyOutline carries the bookmark title and tree structure over to the compressed output", async () => {
  const source = await buildDocumentWithOutline();
  assert.ok(source.catalog.has(PDFName.of("Outlines")), "test fixture itself must actually have bookmarks");

  const output = await copyDocumentLikeCompressDoes(source);
  assert.ok(output.catalog.has(PDFName.of("Outlines")), "bookmarks should now survive compression");

  const outlineRef = output.catalog.get(PDFName.of("Outlines"));
  const outlineDict = output.context.lookup(outlineRef, PDFDict);
  const firstItemRef = outlineDict.get(PDFName.of("First"));
  const firstItemDict = output.context.lookup(firstItemRef, PDFDict);
  assert.equal(firstItemDict.get(PDFName.of("Title"))?.toString(), "(Chapter 1)");
});

test("copyOutline preserves sibling order across multiple bookmarks", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  const context = doc.context;

  const item2Dict = context.obj({ Title: PDFString.of("Chapter 2") });
  const item2Ref = context.register(item2Dict);
  const item1Dict = context.obj({ Title: PDFString.of("Chapter 1"), Next: item2Ref });
  const item1Ref = context.register(item1Dict);
  item2Dict.set(PDFName.of("Prev"), item1Ref);
  const rootDict = context.obj({ Type: PDFName.of("Outlines"), First: item1Ref, Last: item2Ref, Count: 2 });
  const rootRef = context.register(rootDict);
  item1Dict.set(PDFName.of("Parent"), rootRef);
  item2Dict.set(PDFName.of("Parent"), rootRef);
  doc.catalog.set(PDFName.of("Outlines"), rootRef);

  const output = await copyDocumentLikeCompressDoes(doc);
  const outlineRef = output.catalog.get(PDFName.of("Outlines"));
  const outlineDict = output.context.lookup(outlineRef, PDFDict);

  const firstRef = outlineDict.get(PDFName.of("First"));
  const firstDict = output.context.lookup(firstRef, PDFDict);
  assert.equal(firstDict.get(PDFName.of("Title"))?.toString(), "(Chapter 1)");

  const secondRef = firstDict.get(PDFName.of("Next"));
  assert.ok(secondRef instanceof PDFRef, "first item should link to a second via Next");
  const secondDict = output.context.lookup(secondRef, PDFDict);
  assert.equal(secondDict.get(PDFName.of("Title"))?.toString(), "(Chapter 2)");
  assert.equal(outlineDict.get(PDFName.of("Last"))?.toString(), secondRef.toString());
});

// The actual bug this fix was written for: naively deep-copying the whole
// outline subtree (as PDFObjectCopier does for anything reachable through
// a ref) drags in a full, orphaned, uncompressed duplicate of whatever page
// a bookmark's Dest points at -- proven live against pdf-lib before this
// fix landed. copyOutline must produce zero extra page objects.
test("copyOutline does not create an orphaned duplicate page from a bookmark's Dest", async () => {
  const source = await buildDocumentWithOutline({ withDestToSecondPage: true });
  const output = await copyDocumentLikeCompressDoes(source);

  assert.equal(output.getPageCount(), 2, "only the two real, intentionally-copied pages should exist");

  let pageLeafCount = 0;
  for (const [, object] of output.context.enumerateIndirectObjects()) {
    if (object.constructor.name === "PDFPageLeaf") pageLeafCount += 1;
  }
  assert.equal(pageLeafCount, 2, "no extra PDFPageLeaf should be created by copying the outline's Dest");
});

// Unlike /Outlines, a page's link/comment/form annotations live in that
// page's own /Annots array -- part of the page object graph copyPages
// already deep-copies. Proving this holds (rather than assuming it,
// since it's the opposite conclusion from the outline case above) for a
// real link annotation.
test("copyPages preserves a page's link annotation (a real /Annots entry, unlike the document-level outline)", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage([200, 200]);
  const context = source.context;

  const linkAnnotationDict = context.obj({
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Link"),
    Rect: [10, 10, 100, 30],
    A: {
      Type: PDFName.of("Action"),
      S: PDFName.of("URI"),
      URI: PDFString.of("https://example.com"),
    },
  });
  const linkAnnotationRef = context.register(linkAnnotationDict);
  page.node.set(PDFName.of("Annots"), context.obj([linkAnnotationRef]));

  const output = await copyDocumentLikeCompressDoes(source);
  const outputPage = output.getPage(0);
  const annots = outputPage.node.Annots();
  assert.ok(annots, "the copied page should still have an Annots array");
  assert.equal(annots?.size(), 1);

  const copiedAnnotation = output.context.lookup(annots!.get(0), PDFDict);
  const action = copiedAnnotation.lookup(PDFName.of("A"), PDFDict);
  const uri = action.lookup(PDFName.of("URI"));
  assert.equal(uri?.toString(), "(https://example.com)");
});

test("copyAcroForm makes a compressed form's fields recognized again (regression: widgets survived copyPages but /AcroForm never did, leaving dead unfillable boxes)", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage([300, 200]);
  const form = source.getForm();
  const field = form.createTextField("applicant.name");
  field.setText("Jane Doe");
  field.addToPage(page, { x: 80, y: 145, width: 180, height: 20 });

  const reloadedSource = await PDFDocument.load(await source.save());
  const output = await copyDocumentLikeCompressDoes(reloadedSource);
  const reloadedOutput = await PDFDocument.load(await output.save());

  assert.ok(reloadedOutput.catalog.has(PDFName.of("AcroForm")), "output catalog should have /AcroForm");
  const fields = reloadedOutput.getForm().getFields();
  assert.equal(fields.length, 1);
  assert.equal(fields[0].getName(), "applicant.name");
});

test("copyAcroForm does nothing for a document with no form fields (no stray /AcroForm added)", async () => {
  const source = await PDFDocument.create();
  source.addPage([200, 200]);

  const output = await copyDocumentLikeCompressDoes(source);
  assert.equal(output.catalog.has(PDFName.of("AcroForm")), false);
});

// Regression: CompressPdfTool.tsx's rasterize path sized the output page
// with pdf-lib's page.getSize() (reads the raw MediaBox, ignores /Rotate
// entirely) while the rendered canvas came from pdfjs's page.getViewport()
// (rotation-aware: swaps width/height for a 90/270-rotated page to match
// what's actually drawn). For a rotated page those two disagreed, so the
// output page's declared box didn't match the rendered image's real pixel
// aspect ratio -- visibly stretching/squishing the page. Fixed by sizing
// the output page from the same rotation-aware viewport used for
// rendering. This test exercises both real libraries directly (no
// reimplemented math) to prove the mismatch existed and would recur if
// pageInfo-based sizing were ever reintroduced.
test("a 90-degree-rotated page's pdfjs render viewport does not match pdf-lib's rotation-blind getSize (the exact mismatch CompressPdfTool.tsx's rasterize path must use the viewport, not getSize, to avoid)", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.setRotation(degrees(90));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Rotated page text.", { x: 50, y: 700, size: 18, font });
  const bytes = await doc.save();

  const pdfLibDoc = await PDFDocument.load(bytes);
  const pdfLibSize = pdfLibDoc.getPages()[0].getSize();

  const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pdfjsPage = await pdfjsDoc.getPage(1);
  const viewport = pdfjsPage.getViewport({ scale: 1 });

  assert.equal(pdfLibSize.width, 612);
  assert.equal(pdfLibSize.height, 792);
  assert.equal(viewport.width, 792);
  assert.equal(viewport.height, 612);
  assert.notEqual(
    pdfLibSize.width,
    viewport.width,
    "pdf-lib's rotation-blind size must differ from pdfjs's rotation-aware viewport for a 90-degree page -- sizing the output page from getSize() would stretch the rendered image",
  );
});
