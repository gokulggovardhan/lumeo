// lib/pdf/edit/formXObjects.ts
//
// Phase 4 of true PDF text editing: extends detection across a page's
// full content -- every one of its own content streams (a page's
// /Contents can be an array of several, not just one), plus any Form
// XObjects it invokes via the Do operator, recursively, with correct
// ABSOLUTE (page-space) text positions even through nested/rotated Form
// coordinate spaces. collectPageTextOperators is purely read-only.
// resolveStreamTarget (below it) resolves WHERE a rewrite would need to
// go -- the exact stream ref and how to swap it -- but doesn't itself
// mutate anything; the actual write happens in
// lib/pdf/edit/applyEditPlan.ts, which calls it.

import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
  type PDFContext,
  type PDFDocument,
} from "pdf-lib";
import {
  IDENTITY_MATRIX,
  multiplyMatrix,
  tokenizeContentStream,
  walkTextShowOperators,
  type ContentStreamToken,
  type Matrix2x3,
  type TextShowOperator,
} from "./contentStream.ts";

export class CyclicFormReferenceError extends Error {}

// Identifies exactly which content stream a located operator lives in:
// one of the page's own (by index into its possibly-multi-stream
// /Contents), or a Form XObject reached by a chain of resource names
// starting from the page's own /Resources /XObject dict (e.g.
// ["Fm1", "Fm2"] means Fm1's own /Resources /XObject "Fm2").
export type StreamLocator = { kind: "page"; contentStreamIndex: number } | { kind: "xobject"; formPath: string[] };

export type LocatedTextOperator = {
  locator: StreamLocator;
  operatorIndex: number;
  operator: TextShowOperator;
  /** This operator's OWN stream's decoded bytes (not the page's, if inside a Form). */
  streamBytes: Uint8Array;
  /** The /Resources dict in effect at this operator's location (a Form's own, or inherited from its container per spec 8.10.1). */
  resources: PDFDict;
};

type FormInvocation = { xObjectName: string; ctmAtInvocation: Matrix2x3 };

function asNumber(token: ContentStreamToken | undefined): number {
  return token && token.type === "number" ? token.value : 0;
}

// Finds every `Do` operator in a content stream and the CTM in effect at
// that exact point -- only q/Q/cm tracking is needed (Do's position
// relative to a BT/ET text object never affects the CTM, so this doesn't
// need contentStream.ts's fuller text-state machinery).
export function findFormInvocations(bytes: Uint8Array, initialCtm: Matrix2x3 = IDENTITY_MATRIX): FormInvocation[] {
  const tokens = tokenizeContentStream(bytes);
  const results: FormInvocation[] = [];
  const ctmStack: Matrix2x3[] = [];
  let ctm: Matrix2x3 = initialCtm;
  let operands: ContentStreamToken[] = [];

  for (const token of tokens) {
    if (token.type !== "operator") {
      operands.push(token);
      continue;
    }
    switch (token.value) {
      case "q":
        ctmStack.push(ctm);
        break;
      case "Q":
        ctm = ctmStack.pop() ?? IDENTITY_MATRIX;
        break;
      case "cm": {
        const m: Matrix2x3 = [
          asNumber(operands[0]),
          asNumber(operands[1]),
          asNumber(operands[2]),
          asNumber(operands[3]),
          asNumber(operands[4]),
          asNumber(operands[5]),
        ];
        ctm = multiplyMatrix(ctm, m);
        break;
      }
      case "Do": {
        const nameToken = operands[0];
        if (nameToken?.type === "name") {
          results.push({ xObjectName: nameToken.value, ctmAtInvocation: ctm });
        }
        break;
      }
      default:
        break;
    }
    operands = [];
  }
  return results;
}

// pdf-lib's own lookupMaybe(ref, Type) is NOT a graceful "maybe this type,
// maybe something else" helper despite its name -- it only returns
// undefined for a missing/null object; for an object that resolves but is
// the WRONG type, it throws UnexpectedObjectTypeError, exactly like the
// strict lookup(ref, Type). Proven directly: a page /Contents entry
// pointing at a single stream (not wrapped in an array) made
// lookupMaybe(ref, PDFArray) throw "Expected instance of PDFArray, but
// got instance of PDFRawStream" instead of returning undefined as every
// call site below originally assumed. Fixed everywhere in this file by
// using the type-less lookup(ref) (returns PDFObject | undefined, never
// throws on type) and instanceof-checking the result ourselves.
function resolveMaybe(entry: unknown, context: PDFContext): unknown {
  return entry instanceof PDFRef ? context.lookup(entry) : entry;
}

function getResourcesDict(dict: PDFDict, context: PDFContext): PDFDict | undefined {
  const resolved = resolveMaybe(dict.get(PDFName.of("Resources")), context);
  return resolved instanceof PDFDict ? resolved : undefined;
}

function getXObjectDict(resources: PDFDict, context: PDFContext): PDFDict | undefined {
  const resolved = resolveMaybe(resources.get(PDFName.of("XObject")), context);
  return resolved instanceof PDFDict ? resolved : undefined;
}

function lookupRawStream(ref: PDFRef, context: PDFContext): PDFRawStream | undefined {
  const resolved = context.lookup(ref);
  return resolved instanceof PDFRawStream ? resolved : undefined;
}

function readMatrix(dict: PDFDict, context: PDFContext): Matrix2x3 {
  const array = resolveMaybe(dict.get(PDFName.of("Matrix")), context);
  if (!(array instanceof PDFArray) || array.size() !== 6) return IDENTITY_MATRIX;

  const values: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    const resolved = resolveMaybe(array.get(i), context);
    values.push(resolved instanceof PDFNumber ? resolved.asNumber() : i === 0 || i === 3 ? 1 : 0);
  }
  return values as Matrix2x3;
}

function getPageContentStreamRefs(pageDict: PDFDict, context: PDFContext): PDFRef[] {
  const entry = pageDict.get(PDFName.of("Contents"));
  const resolvedEntry = resolveMaybe(entry, context);
  const resolvedArray = resolvedEntry instanceof PDFArray ? resolvedEntry : undefined;

  if (resolvedArray) {
    const refs: PDFRef[] = [];
    for (let i = 0; i < resolvedArray.size(); i += 1) {
      const item = resolvedArray.get(i);
      if (item instanceof PDFRef) refs.push(item);
    }
    return refs;
  }
  return entry instanceof PDFRef ? [entry] : [];
}

const DEFAULT_MAX_DEPTH = 12;

// Recursively collects every text-show operator reachable from a page:
// each of its own content streams, plus every Form XObject invoked
// (directly or nested) from any of them, with each operator's
// textRenderingMatrix already composed to ABSOLUTE page-space
// coordinates. A Form invoking itself, directly or through intermediate
// Forms, is rejected with CyclicFormReferenceError rather than looping
// forever -- detected by tracking the set of stream refs already open on
// the CURRENT recursion path (not globally: the same Form invoked twice
// from two different, non-overlapping places -- a reused XObject -- is
// completely normal and not a cycle). Also capped by maxDepth as a
// second, independent safeguard.
export function collectPageTextOperators(
  doc: PDFDocument,
  pageIndex: number,
  options: { maxDepth?: number } = {},
): LocatedTextOperator[] {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const page = doc.getPages()[pageIndex];
  if (!page) throw new Error(`Page ${pageIndex} does not exist in this document.`);

  const context = doc.context;
  const results: LocatedTextOperator[] = [];
  const pageResources = getResourcesDict(page.node, context);
  if (!pageResources) return results;

  function walkStream(
    bytes: Uint8Array,
    initialCtm: Matrix2x3,
    resources: PDFDict,
    locator: StreamLocator,
    formPath: string[],
    openRefs: ReadonlySet<PDFRef>,
    depth: number,
  ): void {
    const operators = walkTextShowOperators(bytes, initialCtm);
    operators.forEach((operator, operatorIndex) => {
      results.push({ locator, operatorIndex, operator, streamBytes: bytes, resources });
    });

    if (depth >= maxDepth) return;
    const invocations = findFormInvocations(bytes, initialCtm);
    if (invocations.length === 0) return;
    const xObjectDict = getXObjectDict(resources, context);
    if (!xObjectDict) return;

    for (const invocation of invocations) {
      const xObjectEntry = xObjectDict.get(PDFName.of(invocation.xObjectName));
      if (!(xObjectEntry instanceof PDFRef)) continue;
      const xObjectStream = lookupRawStream(xObjectEntry, context);
      if (!xObjectStream) continue;
      const subtype = xObjectStream.dict.get(PDFName.of("Subtype"));
      if (!(subtype instanceof PDFName) || subtype.asString() !== "/Form") continue; // skip Images and anything else.

      if (openRefs.has(xObjectEntry)) {
        throw new CyclicFormReferenceError(
          `Form XObject "${invocation.xObjectName}" refers back to itself (directly or through nested Forms) -- cyclic Form structures are not supported.`,
        );
      }

      // Per spec 8.10.1: a Form's own /Matrix is applied first (within
      // its own coordinate space), then the CTM in effect where Do was
      // invoked -- i.e. formMatrix is the INNER transform, ctmAtInvocation
      // the OUTER one.
      const formMatrix = readMatrix(xObjectStream.dict, context);
      const formInitialCtm = multiplyMatrix(invocation.ctmAtInvocation, formMatrix);
      const formResources = getResourcesDict(xObjectStream.dict, context) ?? resources;
      const formBytes = decodePDFRawStream(xObjectStream).decode();
      const nextPath = [...formPath, invocation.xObjectName];
      const nextOpenRefs = new Set(openRefs);
      nextOpenRefs.add(xObjectEntry);

      walkStream(
        formBytes,
        formInitialCtm,
        formResources,
        { kind: "xobject", formPath: nextPath },
        nextPath,
        nextOpenRefs,
        depth + 1,
      );
    }
  }

  const streamRefs = getPageContentStreamRefs(page.node, context);
  streamRefs.forEach((ref, contentStreamIndex) => {
    const stream = lookupRawStream(ref, context);
    if (!stream) return;
    const bytes = decodePDFRawStream(stream).decode();
    walkStream(bytes, IDENTITY_MATRIX, pageResources, { kind: "page", contentStreamIndex }, [], new Set([ref]), 0);
  });

  return results;
}

export type ResolvedStreamTarget = {
  context: PDFContext;
  targetRef: PDFRef;
  originalStream: PDFRawStream;
  decodedBytes: Uint8Array;
  /** Swaps the resolved location to point at `newRef` and deletes the old stream from the context. */
  writeBack: (newRef: PDFRef) => void;
};

// Resolves exactly where a rewrite targeting (contentStreamIndex, formPath)
// would need to go: the target stream's own ref/bytes, and a writeBack
// callback that knows how to swap in a replacement -- a page's /Contents
// entry (single ref or array slot) when formPath is null/empty, or the
// LAST Form XObject named in formPath, updating ITS parent's /Resources
// /XObject dict entry (the page's own, or an intermediate Form's, per how
// far the path goes). Reuses the exact same Resources/XObject-walking
// helpers collectPageTextOperators itself uses, so a location this
// function can resolve is always one collectPageTextOperators could have
// found in the first place.
export function resolveStreamTarget(
  doc: PDFDocument,
  pageIndex: number,
  contentStreamIndex: number,
  formPath: string[] | null,
): ResolvedStreamTarget {
  const page = doc.getPages()[pageIndex];
  if (!page) throw new Error(`Page ${pageIndex} does not exist in this document.`);
  const context = doc.context;

  if (!formPath || formPath.length === 0) {
    const contentsEntry = page.node.get(PDFName.of("Contents"));
    const resolvedEntry = resolveMaybe(contentsEntry, context);

    if (resolvedEntry instanceof PDFArray) {
      const entryRef = resolvedEntry.get(contentStreamIndex);
      if (!(entryRef instanceof PDFRef)) {
        throw new Error(`Content stream index ${contentStreamIndex} is not a valid indirect reference.`);
      }
      const stream = lookupRawStream(entryRef, context);
      if (!stream) throw new Error("The target content stream is not a raw (undecoded) stream; cannot be safely rewritten.");
      return {
        context,
        targetRef: entryRef,
        originalStream: stream,
        decodedBytes: decodePDFRawStream(stream).decode(),
        writeBack: (newRef) => {
          resolvedEntry.set(contentStreamIndex, newRef);
          context.delete(entryRef);
        },
      };
    }

    if (contentsEntry instanceof PDFRef) {
      const stream = lookupRawStream(contentsEntry, context);
      if (!stream) throw new Error("The target content stream is not a raw (undecoded) stream; cannot be safely rewritten.");
      return {
        context,
        targetRef: contentsEntry,
        originalStream: stream,
        decodedBytes: decodePDFRawStream(stream).decode(),
        writeBack: (newRef) => {
          page.node.set(PDFName.of("Contents"), newRef);
          context.delete(contentsEntry);
        },
      };
    }

    throw new Error("This page's /Contents entry is not an indirect reference; cannot be safely rewritten.");
  }

  let resources = getResourcesDict(page.node, context);
  let parentXObjectDict: PDFDict | null = null;
  let targetRef: PDFRef | null = null;
  let targetStream: PDFRawStream | null = null;

  for (const name of formPath) {
    if (!resources) throw new Error(`Missing /Resources while resolving Form path segment "${name}".`);
    const xObjectDict = getXObjectDict(resources, context);
    if (!xObjectDict) throw new Error(`Missing /Resources /XObject while resolving Form path segment "${name}".`);
    const entry = xObjectDict.get(PDFName.of(name));
    if (!(entry instanceof PDFRef)) throw new Error(`Form XObject "${name}" is not a valid indirect reference.`);
    const stream = lookupRawStream(entry, context);
    if (!stream) throw new Error(`Form XObject "${name}" is not a raw (undecoded) stream; cannot be safely rewritten.`);

    parentXObjectDict = xObjectDict;
    targetRef = entry;
    targetStream = stream;
    resources = getResourcesDict(stream.dict, context) ?? resources;
  }

  if (!targetRef || !parentXObjectDict || !targetStream) {
    throw new Error("Could not resolve the Form XObject path.");
  }
  const lastName = formPath[formPath.length - 1];
  const finalParentDict = parentXObjectDict;
  const finalTargetRef = targetRef;

  return {
    context,
    targetRef: finalTargetRef,
    originalStream: targetStream,
    decodedBytes: decodePDFRawStream(targetStream).decode(),
    writeBack: (newRef) => {
      finalParentDict.set(PDFName.of(lastName), newRef);
      // A Form XObject can be reached from more than one parent
      // Resources/XObject dict object (e.g. the same header Form invoked
      // from two different pages, each with its OWN dict) -- deleting
      // finalTargetRef unconditionally, as this used to do, silently
      // dangled every OTHER invocation site's own dict entry once this
      // one got rewired above (proven: after save+reload, the other
      // page's entry still pointed at finalTargetRef, but that ref no
      // longer resolved to anything). Re-counting AFTER the rewire above
      // means finalTargetRef's own count no longer includes THIS
      // invocation (it now resolves through newRef instead) -- so a
      // count of zero here means nothing else needs it anymore, safe to
      // delete exactly as before; a nonzero count means at least one
      // other site still does, so it's deliberately left registered.
      const stillReferencedElsewhere = (countDocumentFormXObjectInvocations(doc).get(finalTargetRef) ?? 0) > 0;
      if (!stillReferencedElsewhere) {
        context.delete(finalTargetRef);
      }
    },
  };
}

// Counts, across the ENTIRE document (every page, every content stream,
// every nested Form), how many distinct Do-invocation sites resolve to
// each Form XObject ref -- i.e. real, document-wide reuse, not just
// reuse within one page. Read-only; mirrors collectPageTextOperators's
// own recursive walk but only needs to count invocations, not locate
// text. A cyclic reference (already rejected elsewhere by
// collectPageTextOperators) is simply not re-descended into here, so
// this never loops.
export function countDocumentFormXObjectInvocations(doc: PDFDocument): Map<PDFRef, number> {
  const context = doc.context;
  const counts = new Map<PDFRef, number>();

  function walk(bytes: Uint8Array, resources: PDFDict, openRefs: ReadonlySet<PDFRef>, depth: number): void {
    if (depth >= DEFAULT_MAX_DEPTH) return;
    const invocations = findFormInvocations(bytes);
    if (invocations.length === 0) return;
    const xObjectDict = getXObjectDict(resources, context);
    if (!xObjectDict) return;

    for (const invocation of invocations) {
      const xObjectEntry = xObjectDict.get(PDFName.of(invocation.xObjectName));
      if (!(xObjectEntry instanceof PDFRef)) continue;
      const xObjectStream = lookupRawStream(xObjectEntry, context);
      if (!xObjectStream) continue;
      const subtype = xObjectStream.dict.get(PDFName.of("Subtype"));
      if (!(subtype instanceof PDFName) || subtype.asString() !== "/Form") continue;

      counts.set(xObjectEntry, (counts.get(xObjectEntry) ?? 0) + 1);
      if (openRefs.has(xObjectEntry)) continue;

      const formResources = getResourcesDict(xObjectStream.dict, context) ?? resources;
      const formBytes = decodePDFRawStream(xObjectStream).decode();
      const nextOpenRefs = new Set(openRefs);
      nextOpenRefs.add(xObjectEntry);
      walk(formBytes, formResources, nextOpenRefs, depth + 1);
    }
  }

  for (const page of doc.getPages()) {
    const resources = getResourcesDict(page.node, context);
    if (!resources) continue;
    for (const ref of getPageContentStreamRefs(page.node, context)) {
      const stream = lookupRawStream(ref, context);
      if (!stream) continue;
      walk(decodePDFRawStream(stream).decode(), resources, new Set([ref]), 0);
    }
  }

  return counts;
}

// A shared Form XObject can't be safely isolated in two situations,
// both rejected honestly rather than attempted (see
// resolveIsolatedStreamTarget):
// - The SAME resource name is invoked more than once within one
//   immediate parent content stream -- distinguishing which of several
//   identical `/Name Do` tokens is "the one" would require rewriting a
//   Do operator's own operand bytes, a fundamentally different and far
//   riskier kind of edit than anything else in this engine, which has
//   only ever rewritten Tj/TJ/'/" string operands.
// - The immediate parent Form itself is ALSO invoked from more than one
//   place -- redirecting one of ITS resource-dict entries would change
//   every one of ITS OWN invocation sites too, cascading the exact
//   problem being solved. Isolating through a chain of shared ancestors
//   would need cloning the whole chain, which is out of scope for this
//   slice.
export class AmbiguousSharedFormError extends Error {}

// Like resolveStreamTarget, but for a Form XObject reused elsewhere in
// the document (a different page, or a different, NOT-itself-shared
// parent), redirects just THIS ONE resolution path's own resource-dict
// entry to a fresh clone of the target Form -- so editing it doesn't
// silently change every other invocation site. The clone is registered
// under the SAME resource name, in the SAME parent dict object this one
// path resolved through; since that parent dict object belongs
// exclusively to this one invocation site (verified above), no other
// site is affected, and the original Form ref is left completely
// untouched (not deleted) since other sites still need it. A Form that
// isn't actually shared anywhere else needs no clone at all -- resolved
// exactly like resolveStreamTarget. Page-level content streams (formPath
// null/empty) aren't "reused" in this sense, so isolation is a no-op
// there -- delegates straight to resolveStreamTarget.
export function resolveIsolatedStreamTarget(
  doc: PDFDocument,
  pageIndex: number,
  contentStreamIndex: number,
  formPath: string[] | null,
): ResolvedStreamTarget {
  if (!formPath || formPath.length === 0) {
    return resolveStreamTarget(doc, pageIndex, contentStreamIndex, null);
  }

  const context = doc.context;
  const page = doc.getPages()[pageIndex];
  if (!page) throw new Error(`Page ${pageIndex} does not exist in this document.`);

  const streamRefs = getPageContentStreamRefs(page.node, context);
  const pageStreamRef = streamRefs[contentStreamIndex];
  if (!pageStreamRef) throw new Error(`Content stream index ${contentStreamIndex} does not exist.`);
  const pageStream = lookupRawStream(pageStreamRef, context);
  if (!pageStream) throw new Error("The page's content stream is not a raw stream.");

  // Single top-to-bottom walk down formPath, tracking the CURRENT
  // parent's own bytes/resources/ref as we go. When we reach the last
  // segment, the parent we're currently holding IS its immediate parent
  // -- captured before advancing any further, so it never gets
  // overwritten by the final Form's own (irrelevant, for this purpose)
  // content. immediateParentRef is null when the immediate parent is the
  // page itself (formPath.length === 1), which is never itself "shared"
  // in this model (each page owns its own /Contents).
  let currentBytes = decodePDFRawStream(pageStream).decode();
  let currentResources = getResourcesDict(page.node, context);
  let currentRef: PDFRef | null = null;

  let immediateParentBytes: Uint8Array | null = null;
  let immediateParentXObjectDict: PDFDict | null = null;
  let immediateParentRef: PDFRef | null = null;
  let targetRef: PDFRef | null = null;

  for (let i = 0; i < formPath.length; i += 1) {
    const name = formPath[i];
    if (!currentResources) throw new Error(`Missing /Resources while resolving Form path segment "${name}".`);
    const xObjectDict = getXObjectDict(currentResources, context);
    if (!xObjectDict) throw new Error(`Missing /Resources /XObject while resolving Form path segment "${name}".`);
    const entry = xObjectDict.get(PDFName.of(name));
    if (!(entry instanceof PDFRef)) throw new Error(`Form XObject "${name}" is not a valid indirect reference.`);
    const stream = lookupRawStream(entry, context);
    if (!stream) throw new Error(`Form XObject "${name}" is not a raw (undecoded) stream; cannot be safely rewritten.`);

    if (i === formPath.length - 1) {
      immediateParentBytes = currentBytes;
      immediateParentXObjectDict = xObjectDict;
      immediateParentRef = currentRef;
      targetRef = entry;
    }

    currentResources = getResourcesDict(stream.dict, context) ?? currentResources;
    currentBytes = decodePDFRawStream(stream).decode();
    currentRef = entry;
  }

  if (!targetRef || !immediateParentXObjectDict || !immediateParentBytes) {
    throw new Error("Could not resolve the Form XObject path.");
  }

  const lastName = formPath[formPath.length - 1];
  const targetStream = lookupRawStream(targetRef, context);
  if (!targetStream) throw new Error(`Form XObject "${lastName}" is not a raw (undecoded) stream; cannot be safely rewritten.`);

  const sameParentInvocations = findFormInvocations(immediateParentBytes).filter(
    (inv) => inv.xObjectName === lastName,
  ).length;
  if (sameParentInvocations > 1) {
    throw new AmbiguousSharedFormError(
      `Form XObject "${lastName}" is invoked more than once by name within the same parent content stream -- isolating a single occurrence would require rewriting a Do operator's own operand, which this engine does not support.`,
    );
  }

  const invocationCounts = countDocumentFormXObjectInvocations(doc);

  if (immediateParentRef !== null && (invocationCounts.get(immediateParentRef) ?? 0) > 1) {
    throw new AmbiguousSharedFormError(
      `Form XObject "${lastName}"'s immediate parent Form is itself invoked from more than one place -- isolating "${lastName}" here would require also isolating its shared ancestor, which this engine does not support.`,
    );
  }

  const totalInvocations = invocationCounts.get(targetRef) ?? 0;
  if (totalInvocations <= 1) {
    // Not actually shared anywhere else -- nothing to isolate from.
    return resolveStreamTarget(doc, pageIndex, contentStreamIndex, formPath);
  }

  // Genuinely shared, and this specific resolution path is safe to
  // isolate: the immediate parent dict object belongs exclusively to
  // this one invocation site (just verified), so redirecting ITS
  // "lastName" entry -- to a clone, under the SAME name -- affects only
  // this one path. Every other invocation site, reached through a
  // DIFFERENT parent dict object entirely, keeps its own "lastName"
  // entry pointing at the original, completely untouched ref.
  const finalParentDict = immediateParentXObjectDict;
  const finalLastName = PDFName.of(lastName);
  const originalRef = targetRef;

  return {
    context,
    targetRef: originalRef,
    originalStream: targetStream,
    decodedBytes: decodePDFRawStream(targetStream).decode(),
    writeBack: (newRef) => {
      finalParentDict.set(finalLastName, newRef);
      // Deliberately do NOT delete originalRef: other invocation sites,
      // reached through a different parent dict object, still need it.
    },
  };
}
