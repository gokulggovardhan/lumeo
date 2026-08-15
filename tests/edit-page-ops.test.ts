import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  PageOpError,
  countElementsOnRemovedPages,
  deletePages,
  mergePdf,
  remapElements,
  remapPageIndex,
  reorderPages,
  splitPdf,
} from "../lib/pdf/edit/pageOps.ts";
import { createTextElement, createWhiteoutElement, type EditElement } from "../lib/pdf/edit/elements.ts";

// Page structure and placed elements are two halves of ONE history snapshot.
// The failure these tests exist to prevent is not a crash -- it is a
// reorder that leaves someone's annotation on the wrong page, which nobody
// notices until the document is already out the door.

/** Each page carries its own number as text, so order is verifiable. */
async function numberedPdf(pageCount: number, label = "Page"): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pageCount; i += 1) {
    const page = doc.addPage([300, 400]);
    page.drawText(`${label} ${i}`, { x: 40, y: 340, size: 24, font });
  }
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function pageTexts(bytes: ArrayBuffer): Promise<string[]> {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(content.items.map((item) => ("str" in item ? item.str : "")).join("").trim());
  }
  return out;
}

test("reorderPages puts the pages in the order given, verified by their content", async () => {
  const source = await numberedPdf(4);
  const { bytes, pageCount } = await reorderPages(source, [3, 0, 2, 1]);
  assert.equal(pageCount, 4);
  assert.deepEqual(await pageTexts(bytes), ["Page 4", "Page 1", "Page 3", "Page 2"]);
});

test("reorderPages reports where each original page went", async () => {
  const source = await numberedPdf(4);
  const { pageMap } = await reorderPages(source, [3, 0, 2, 1]);
  // Original page 0 is now at 1, page 1 at 3, page 2 at 2, page 3 at 0.
  assert.deepEqual(pageMap, [1, 3, 2, 0]);
});

test("reorderPages preserves a page's existing rotation", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]);
  doc.addPage([300, 400]).setRotation(degrees(90));
  const saved = await doc.save();
  const source = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer;

  const { bytes } = await reorderPages(source, [1, 0]);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPage(0).getRotation().angle, 90);
  assert.equal(reloaded.getPage(1).getRotation().angle, 0);
});

test("reorderPages rejects an order that repeats or invents a page", async () => {
  const source = await numberedPdf(3);
  await assert.rejects(() => reorderPages(source, [0, 0, 1]), PageOpError);
  await assert.rejects(() => reorderPages(source, [0, 1, 5]), PageOpError);
  await assert.rejects(() => reorderPages(source, []), PageOpError);
});

test("deletePages removes exactly the pages asked for and closes the gap", async () => {
  const source = await numberedPdf(5);
  const { bytes, pageMap, pageCount } = await deletePages(source, [1, 3]);
  assert.equal(pageCount, 3);
  assert.deepEqual(await pageTexts(bytes), ["Page 1", "Page 3", "Page 5"]);
  assert.deepEqual(pageMap, [0, null, 1, null, 2]);
});

// Organize already refuses this (validateOrganizeItems); the two must agree.
test("deletePages refuses to empty the document", async () => {
  const source = await numberedPdf(2);
  await assert.rejects(() => deletePages(source, [0, 1]), PageOpError);
});

test("mergePdf appends by default and shifts nothing", async () => {
  const base = await numberedPdf(2, "Base");
  const incoming = await numberedPdf(2, "Extra");
  const { bytes, pageMap, pageCount } = await mergePdf(base, incoming);
  assert.equal(pageCount, 4);
  assert.deepEqual(await pageTexts(bytes), ["Base 1", "Base 2", "Extra 1", "Extra 2"]);
  assert.deepEqual(pageMap, [0, 1]);
});

test("mergePdf inserts mid-document and shifts the pages after the insertion point", async () => {
  const base = await numberedPdf(3, "Base");
  const incoming = await numberedPdf(2, "Extra");
  const { bytes, pageMap } = await mergePdf(base, incoming, 1);
  assert.deepEqual(await pageTexts(bytes), ["Base 1", "Extra 1", "Extra 2", "Base 2", "Base 3"]);
  // Base page 0 stays; base pages 1 and 2 move down by the two inserted.
  assert.deepEqual(pageMap, [0, 3, 4]);
});

test("mergePdf clamps an out-of-range insertion point rather than throwing", async () => {
  const base = await numberedPdf(2, "Base");
  const incoming = await numberedPdf(1, "Extra");
  const { bytes } = await mergePdf(base, incoming, 99);
  assert.deepEqual(await pageTexts(bytes), ["Base 1", "Base 2", "Extra 1"]);
});

test("mergePdf gives a readable reason when the incoming file is not a PDF", async () => {
  const base = await numberedPdf(1);
  const notAPdf = new TextEncoder().encode("this is not a pdf").buffer as ArrayBuffer;
  await assert.rejects(() => mergePdf(base, notAPdf), (error: Error) => {
    assert.ok(error instanceof PageOpError);
    assert.match(error.message, /could not be read as a PDF/);
    return true;
  });
});

test("splitPdf extracts the requested pages, in the requested order, leaving the source alone", async () => {
  const source = await numberedPdf(5);
  const { bytes, pageCount } = await splitPdf(source, [4, 0]);
  assert.equal(pageCount, 2);
  assert.deepEqual(await pageTexts(bytes), ["Page 5", "Page 1"]);
  // The source buffer must be untouched -- callers keep editing it.
  assert.deepEqual(await pageTexts(source), ["Page 1", "Page 2", "Page 3", "Page 4", "Page 5"]);
});

test("splitPdf refuses an empty selection", async () => {
  const source = await numberedPdf(2);
  await assert.rejects(() => splitPdf(source, []), PageOpError);
});

// --- element remapping: the half that silently corrupts work if wrong ---

function elementsOnPages(pages: number[]): EditElement[] {
  return pages.map((pageIndex, i) => createTextElement(`t${i}`, pageIndex, 10, 10));
}

test("remapElements moves elements to follow their page", async () => {
  const source = await numberedPdf(4);
  const { pageMap } = await reorderPages(source, [3, 0, 2, 1]);
  const elements = elementsOnPages([0, 1, 2, 3]);
  const moved = remapElements(elements, pageMap);
  assert.deepEqual(moved.map((e) => e.pageIndex), [1, 3, 2, 0]);
  // Identity is preserved -- these are the same annotations, relocated.
  assert.deepEqual(moved.map((e) => e.id), ["t0", "t1", "t2", "t3"]);
});

test("remapElements drops elements on a deleted page rather than reassigning them", async () => {
  const source = await numberedPdf(4);
  const { pageMap } = await deletePages(source, [1]);
  const elements = [...elementsOnPages([0, 1, 2]), createWhiteoutElement("w0", 1, 5, 5)];

  const remaining = remapElements(elements, pageMap);
  assert.deepEqual(remaining.map((e) => e.id), ["t0", "t2"]);
  assert.deepEqual(remaining.map((e) => e.pageIndex), [0, 1]);
  // Two elements sat on the deleted page; the caller needs that count to
  // tell the user what it removed.
  assert.equal(countElementsOnRemovedPages(elements, pageMap), 2);
});

test("remapElements shifts elements after a mid-document merge", async () => {
  const base = await numberedPdf(3, "Base");
  const incoming = await numberedPdf(2, "Extra");
  const { pageMap } = await mergePdf(base, incoming, 1);
  const moved = remapElements(elementsOnPages([0, 1, 2]), pageMap);
  assert.deepEqual(moved.map((e) => e.pageIndex), [0, 3, 4]);
});

test("remapElements leaves untouched elements referentially identical, so React can skip them", async () => {
  const source = await numberedPdf(3);
  const { pageMap } = await deletePages(source, [2]);
  const elements = elementsOnPages([0, 1]);
  const moved = remapElements(elements, pageMap);
  assert.equal(moved[0], elements[0]);
  assert.equal(moved[1], elements[1]);
});

test("remapElements discards an element pointing past the end of the old document", async () => {
  const source = await numberedPdf(2);
  const { pageMap } = await reorderPages(source, [1, 0]);
  const stray = createTextElement("stray", 7, 10, 10);
  assert.deepEqual(remapElements([stray], pageMap), []);
});

test("remapPageIndex follows the page you were looking at", async () => {
  const source = await numberedPdf(4);
  const { pageMap, pageCount } = await reorderPages(source, [3, 0, 2, 1]);
  assert.equal(remapPageIndex(3, pageMap, pageCount), 0);
});

// Deleting the page you are viewing should leave you somewhere sensible,
// not on page 1 and not out of bounds past the new end.
test("remapPageIndex falls back to the nearest surviving page when yours is deleted", async () => {
  const source = await numberedPdf(5);
  const { pageMap, pageCount } = await deletePages(source, [2]);
  const landing = remapPageIndex(2, pageMap, pageCount);
  assert.ok(landing === 1 || landing === 2, `expected a neighbour of the deleted page, got ${landing}`);
  assert.ok(landing < pageCount);
});
