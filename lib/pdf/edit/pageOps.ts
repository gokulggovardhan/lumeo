// lib/pdf/edit/pageOps.ts
//
// Structural page operations for the Edit workspace: reorder, delete, merge
// and extract. Pure -- bytes in, bytes out, no React and no project-file
// imports beyond the element type, so it runs directly under Node's test
// runner with --experimental-strip-types.
//
// Every operation returns a PAGE MAP alongside the new bytes, and that is
// the part that matters. Placed elements (text boxes, whiteouts, ink,
// images) are keyed by pageIndex. Move or delete a page without remapping
// them and the user's annotations silently land on the wrong page, or
// survive as orphans pointing past the end of the document. The map is how
// the two halves of the history snapshot stay consistent with each other.
//
// The item-list algebra for a thumbnail sidebar already exists in
// lib/pdf/pageOrganizer.ts (moveItem/removeItems/rotateItems, with tests).
// This module is the byte-level half that Organize keeps inline in its own
// component; it is deliberately expressed in terms of the LIVE document's
// indices rather than that module's `sourcePage`, because merging brings in
// pages from a second document that no single-source item list can address.

import { PDFDocument } from "pdf-lib";
import type { EditElement } from "./elements.ts";

/**
 * `pageMap[oldIndex]` is where that page ended up, or `null` if it is gone.
 * Pages that did not exist before the operation (merged-in pages) simply
 * have no entry -- the array is indexed by the OLD document's pages.
 */
export type PageMap = (number | null)[];

export type PageOpResult = { bytes: ArrayBuffer; pageMap: PageMap; pageCount: number };

export class PageOpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageOpError";
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Rebuilds a document from `order`, a permutation of the current page
 * indices. Anything omitted from `order` is dropped, so this is also the
 * primitive deletePages is expressed in terms of.
 *
 * copyPages carries each page's own object graph -- rotation, annotations,
 * its /Resources -- so page-level fidelity survives. Document-level
 * structures (the outline, /AcroForm) do NOT come across; that is a known
 * property of this approach and is why CompressPdfTool.tsx copies AcroForm
 * separately. Left as-is here for now: Edit's own export path has the same
 * characteristic today, so page ops introduce no new loss.
 */
export async function reorderPages(source: ArrayBuffer, order: readonly number[]): Promise<PageOpResult> {
  const input = await PDFDocument.load(source.slice(0));
  const pageCount = input.getPageCount();

  if (order.length === 0) {
    throw new PageOpError("A PDF must keep at least one page.");
  }
  const seen = new Set<number>();
  for (const index of order) {
    if (!Number.isInteger(index) || index < 0 || index >= pageCount) {
      throw new PageOpError(`Page ${index + 1} is not in this document.`);
    }
    if (seen.has(index)) throw new PageOpError(`Page ${index + 1} appears twice in the new order.`);
    seen.add(index);
  }

  const output = await PDFDocument.create();
  const copied = await output.copyPages(input, [...order]);
  for (const page of copied) output.addPage(page);

  const pageMap: PageMap = new Array(pageCount).fill(null);
  order.forEach((oldIndex, newIndex) => {
    pageMap[oldIndex] = newIndex;
  });

  const saved = await output.save();
  return { bytes: toArrayBuffer(saved), pageMap, pageCount: order.length };
}

export async function deletePages(source: ArrayBuffer, remove: Iterable<number>): Promise<PageOpResult> {
  const input = await PDFDocument.load(source.slice(0));
  const pageCount = input.getPageCount();
  const removing = new Set(remove);

  const keep: number[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    if (!removing.has(index)) keep.push(index);
  }
  if (keep.length === 0) {
    // The same refusal Organize already makes (validateOrganizeItems), kept
    // consistent so the two tools cannot disagree about what is legal.
    throw new PageOpError("Removing every page would leave an empty PDF.");
  }
  return reorderPages(source, keep);
}

/**
 * Inserts every page of `incoming` into `base` at `insertAt` (0-based, in
 * the base document's current indexing; clamped to the ends).
 *
 * Both documents are copied into a fresh output rather than mutating base
 * in place: pdf-lib's insertPage on a loaded document can leave the two
 * documents' object graphs entangled, and rebuilding sidesteps that
 * entirely for a cost that is invisible at these page counts.
 */
export async function mergePdf(base: ArrayBuffer, incoming: ArrayBuffer, insertAt?: number): Promise<PageOpResult> {
  const baseDoc = await PDFDocument.load(base.slice(0));
  let incomingDoc: PDFDocument;
  try {
    incomingDoc = await PDFDocument.load(incoming.slice(0));
  } catch {
    throw new PageOpError("That file could not be read as a PDF. It may be damaged or password-protected.");
  }

  const baseCount = baseDoc.getPageCount();
  const incomingCount = incomingDoc.getPageCount();
  if (incomingCount === 0) throw new PageOpError("That PDF has no pages to add.");

  const at = Math.max(0, Math.min(insertAt ?? baseCount, baseCount));

  const output = await PDFDocument.create();
  const before = await output.copyPages(baseDoc, Array.from({ length: at }, (_, i) => i));
  const middle = await output.copyPages(incomingDoc, Array.from({ length: incomingCount }, (_, i) => i));
  const after = await output.copyPages(
    baseDoc,
    Array.from({ length: baseCount - at }, (_, i) => at + i),
  );
  for (const page of [...before, ...middle, ...after]) output.addPage(page);

  // Base pages before the insertion point keep their index; those after it
  // shift by the number of pages inserted.
  const pageMap: PageMap = Array.from({ length: baseCount }, (_, oldIndex) =>
    oldIndex < at ? oldIndex : oldIndex + incomingCount,
  );

  const saved = await output.save();
  return { bytes: toArrayBuffer(saved), pageMap, pageCount: baseCount + incomingCount };
}

/**
 * Extracts `indices` into a new document, in the order given. Used for
 * "split off these pages" -- it does not modify the source, so the caller
 * decides whether the extracted range is a download or replaces the
 * document being edited.
 */
export async function splitPdf(source: ArrayBuffer, indices: readonly number[]): Promise<PageOpResult> {
  if (indices.length === 0) throw new PageOpError("Select at least one page to extract.");
  return reorderPages(source, indices);
}

/**
 * Moves placed elements to follow their pages.
 *
 * Elements on a deleted page are DROPPED, not reassigned. Silently moving
 * someone's annotation to a neighbouring page would be worse than losing
 * it: they would not notice, and the document would be wrong. The caller is
 * expected to tell the user how many were removed -- see
 * `countElementsOnRemovedPages`.
 */
export function remapElements(elements: readonly EditElement[], pageMap: PageMap): EditElement[] {
  return elements
    .map((element) => {
      const next = pageMap[element.pageIndex];
      // An element on a page the map does not mention (index past the old
      // document's end) is already inconsistent; drop it rather than
      // propagate it.
      if (next === null || next === undefined) return null;
      return next === element.pageIndex ? element : { ...element, pageIndex: next };
    })
    .filter((element): element is EditElement => element !== null);
}

export function countElementsOnRemovedPages(elements: readonly EditElement[], pageMap: PageMap): number {
  return elements.filter((element) => {
    const next = pageMap[element.pageIndex];
    return next === null || next === undefined;
  }).length;
}

/**
 * Where a given page index ends up, for keeping the user's current page
 * selection sensible after an operation. Falls back to the nearest page
 * that survived, so deleting the page you are looking at leaves you
 * somewhere reasonable rather than on page 1 or out of bounds.
 */
export function remapPageIndex(pageIndex: number, pageMap: PageMap, newPageCount: number): number {
  const direct = pageMap[pageIndex];
  if (direct !== null && direct !== undefined) return direct;
  for (let offset = 1; offset < pageMap.length; offset += 1) {
    const before = pageMap[pageIndex - offset];
    if (before !== null && before !== undefined) return before;
    const after = pageMap[pageIndex + offset];
    if (after !== null && after !== undefined) return after;
  }
  return Math.min(Math.max(0, pageIndex), Math.max(0, newPageCount - 1));
}
