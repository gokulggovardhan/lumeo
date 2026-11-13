import { PDFArray, PDFDict, PDFDocument, PDFRawStream, PDFRef, type PDFContext } from "pdf-lib";
import { inspectPdfStructure } from "../structuralEligibility.ts";

/**
 * Phase 4: a lossless rewrite is accepted only after a second, independent
 * parse proves the document's page dictionaries, original content operators,
 * resource trees, and embedded resource streams remain byte-for-byte equal.
 *
 * This deliberately rejects unfamiliar/cyclic/oversized object graphs and
 * leaves the original untouched; it never edits or uploads user documents.
 */
const MAX_NODES = 24_000;
const MAX_DEPTH = 32;

type Comparison = {
  left: PDFContext;
  right: PDFContext;
  visited: WeakMap<object, WeakSet<object>>;
  nodes: number;
};

function dereference(value: unknown, context: PDFContext): unknown {
  if (!(value instanceof PDFRef)) return value;
  const resolved = context.lookup(value);
  if (resolved === undefined || resolved === null) {
    throw new Error("Unresolved PDF object reference.");
  }
  return resolved;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let i = 0; i < left.byteLength; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function sameObject(leftValue: unknown, rightValue: unknown, state: Comparison, depth = 0): boolean {
  if (depth > MAX_DEPTH || ++state.nodes > MAX_NODES) {
    throw new Error("PDF graph exceeds the bounded lossless-verification limit.");
  }
  const left = dereference(leftValue, state.left);
  const right = dereference(rightValue, state.right);
  if (left === undefined || right === undefined || left === null || right === null) {
    return left === right;
  }
  if (typeof left !== "object" || typeof right !== "object") {
    return Object.is(left, right);
  }
  if (left.constructor !== right.constructor) return false;

  let paired = state.visited.get(left);
  if (paired?.has(right)) return true;
  if (!paired) {
    paired = new WeakSet<object>();
    state.visited.set(left, paired);
  }
  paired.add(right);

  if (left instanceof PDFRawStream && right instanceof PDFRawStream) {
    return sameBytes(left.getContents(), right.getContents()) &&
      sameObject(left.dict, right.dict, state, depth + 1);
  }
  if (left instanceof PDFArray && right instanceof PDFArray) {
    if (left.size() !== right.size()) return false;
    for (let i = 0; i < left.size(); i += 1) {
      if (!sameObject(left.get(i), right.get(i), state, depth + 1)) return false;
    }
    return true;
  }
  if (left instanceof PDFDict && right instanceof PDFDict) {
    const leftKeys = left.keys().map((key) => key.toString()).sort();
    const rightKeys = right.keys().map((key) => key.toString()).sort();
    if (leftKeys.length !== rightKeys.length ||
        leftKeys.some((key, index) => key !== rightKeys[index])) return false;
    for (const key of left.keys()) {
      if (!sameObject(left.get(key), right.get(key), state, depth + 1)) return false;
    }
    return true;
  }
  // PDFName, PDFNumber, PDFBool, PDFNull, PDFString and PDFHexString
  // are immutable scalar PDF objects; compare their serialized values.
  return left.toString() === right.toString();
}

function comparison(left: PDFDocument, right: PDFDocument): Comparison {
  return {
    left: left.context,
    right: right.context,
    visited: new WeakMap<object, WeakSet<object>>(),
    nodes: 0,
  };
}

function samePage(
  left: ReturnType<PDFDocument["getPages"]>[number],
  right: ReturnType<PDFDocument["getPages"]>[number],
  state: Comparison,
): boolean {
  // The parent reference is tied to the page-tree representation, not the
  // visible page itself. The actual page dictionary, inherited resources and
  // effective geometry are compared independently.
  const leftKeys = left.node.keys().filter((key) => key.toString() !== "/Parent");
  const rightKeys = right.node.keys().filter((key) => key.toString() !== "/Parent");
  if (leftKeys.length !== rightKeys.length ||
      leftKeys.map((key) => key.toString()).sort().join("|") !==
      rightKeys.map((key) => key.toString()).sort().join("|")) return false;

  for (const key of leftKeys) {
    if (!sameObject(left.node.get(key), right.node.get(key), state)) return false;
  }
  return sameObject(left.node.Resources(), right.node.Resources(), state);
}

/**
 * Returns false on any uncertain integrity condition. A false result is NOT a
 * failed PDF export; the compressor must retain the exact original bytes.
 */
export async function verifyLosslessPdfRewrite(
  original: PDFDocument,
  candidateBytes: Uint8Array,
): Promise<boolean> {
  try {
    const candidate = await PDFDocument.load(candidateBytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    if (original.getPageCount() !== candidate.getPageCount()) return false;

    const before = inspectPdfStructure(original);
    const after = inspectPdfStructure(candidate);
    if (!before.safeForCompression || !after.safeForCompression ||
        JSON.stringify(before) !== JSON.stringify(after)) return false;

    const state = comparison(original, candidate);
    const beforeCatalog = original.catalog.keys().map((key) => key.toString()).sort();
    const afterCatalog = candidate.catalog.keys().map((key) => key.toString()).sort();
    if (beforeCatalog.join("|") !== afterCatalog.join("|")) return false;
    for (const key of original.catalog.keys()) {
      if (key.toString() === "/Pages") continue;
      if (!sameObject(original.catalog.get(key), candidate.catalog.get(key), state)) return false;
    }
    const pagesBefore = original.getPages();
    const pagesAfter = candidate.getPages();
    for (let i = 0; i < pagesBefore.length; i += 1) {
      const a = pagesBefore[i];
      const b = pagesAfter[i];
      if (JSON.stringify(a.getMediaBox()) !== JSON.stringify(b.getMediaBox()) ||
          JSON.stringify(a.getCropBox()) !== JSON.stringify(b.getCropBox()) ||
          a.getRotation().angle !== b.getRotation().angle ||
          !samePage(a, b, state)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
