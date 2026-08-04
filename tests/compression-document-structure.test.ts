import assert from "node:assert/strict";
import test from "node:test";
import { PDFDict, PDFDocument, PDFName, PDFRef, PDFString, type PDFContext } from "pdf-lib";

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
  return output;
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
