// lib/pdf/edit/applyEditPlan.ts
//
// Phases 3-4 of true PDF text editing: real content-stream mutation.
// applyEditPlanToDocument rewrites exactly one verified EditPlan's
// Tj/TJ/'/" operator; applyMultiRunEditPlanToDocument (Phase 4) rewrites
// every operator in a verified MultiRunEditPlan
// (lib/pdf/edit/multiRunEditPlan.ts) as one logical edit. Either way,
// nothing else in the content stream, and nothing else in the PDF's
// object graph, changes.
//
// Deliberately narrow, per the approved slice scope:
// - All four PDF text-showing operators are supported.
// - A TJ rewrite always collapses to a single combined string operand
//   (see buildReplacementOperatorText) plus, when needed, one trailing
//   spacing-adjustment number computed by fontMetrics.ts's compareAdvance
//   -- the original's own inter-string kerning numbers are dropped, since
//   they were tuned for the original text's specific glyph boundaries and
//   have no coherent meaning once the text changes.
// - A " rewrite preserves its own aw/ac (word/char spacing) operands
//   verbatim -- they're never recomputed, only carried through from the
//   matched EditPlan (see EditPlan.wordSpacing/charSpacing's doc comment).
// - No fallback-font path -- an EditPlan that isn't already `editable`
//   (built by editPlan.ts, which already enforces this) is rejected here
//   too, as a second, independent check rather than trusting the caller.

import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream } from "pdf-lib";
import type { PDFContext, PDFPage } from "pdf-lib";
import type { EditPlan } from "./editPlan.ts";
import type { MultiRunEditPlan } from "./multiRunEditPlan.ts";
import { resolveStreamTarget } from "./formXObjects.ts";

export class EditPlanRejectedError extends Error {}

function encodeGlyphCodesToHex(codes: number[], bytesPerCode: 1 | 2): string {
  const bytes: number[] = [];
  for (const code of codes) {
    if (bytesPerCode === 1) {
      bytes.push(code & 0xff);
    } else {
      bytes.push((code >> 8) & 0xff, code & 0xff);
    }
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const SUPPORTED_OPERATOR_TYPES: ReadonlySet<EditPlan["operatorType"]> = new Set(["Tj", "TJ", "'", '"']);

function assertApplicable(plan: EditPlan): void {
  if (!plan.editable) {
    throw new EditPlanRejectedError(plan.reason ?? "This edit plan is not editable.");
  }
  if (!SUPPORTED_OPERATOR_TYPES.has(plan.operatorType)) {
    throw new EditPlanRejectedError(`This rewrite engine does not support the "${plan.operatorType}" operator.`);
  }
  // A plan with zero replacement glyphs (any operator kind) produces
  // `<>`/`[<>]` -- an empty string/array, syntactically valid PDF that
  // shows nothing. Proven safe and real, not just theoretically legal:
  // lib/pdf/edit/multiRunEditPlan.ts intentionally empties every operator
  // in a merged span except the first, and its own tests confirm the
  // resulting PDF opens and extracts correctly.
}

// A numeric PDF operand can carry many decimal places when computed
// (e.g. a spacing delta); format with just enough precision to round-trip
// through the tokenizer cleanly without accumulating stray floating-point
// noise like "12.000000000000002".
function formatPdfNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded.toString();
}

// The minimum adjustment magnitude worth writing into the TJ array at
// all -- anything smaller is imperceptible and would only add byte-stream
// noise (an explicit "0" or near-0 entry), so an equal-width replacement
// naturally produces the cleanest possible array: just the new string,
// no adjustment number.
const TJ_DELTA_EPSILON = 0.01;

// Builds the exact replacement operator invocation text for `plan`:
// - Tj: `<hex> Tj`.
// - TJ: `[<hex>] TJ` or `[<hex> delta] TJ`. A TJ replacement always
//   collapses to a single combined string operand (task 3: rewrite only
//   text operands) -- the original's own inter-string kerning numbers are
//   dropped rather than kept, since they were tuned for the ORIGINAL
//   text's specific glyph boundaries and have no coherent attachment
//   point once the text itself changes (task 4: leave spacing operands
//   untouched *unless recalculation is required* -- here it is required).
//   In their place, a single trailing adjustment equal to
//   plan.tjSpacingDelta (fontMetrics.ts's compareAdvance, task 5: use the
//   existing spacing engine) keeps whatever text follows this operator
//   from shifting position -- omitted entirely when negligible.
// - ' (quote): `<hex> '`. No spacing operands to preserve -- ' takes only
//   a string.
// - " (double-quote): `aw ac <hex> "`, where aw/ac are plan.wordSpacing/
//   plan.charSpacing -- these ARE this operator's own two leading numeric
//   operands (word spacing, char spacing), carried through EditPlan
//   unchanged from the original operator (task 5: preserve all non-text
//   operands verbatim; these are never recomputed).
// No compensating spacing delta is added for ' or ", unlike TJ: each
// already performs its own text-line move (equivalent to T*) before
// showing text, so whatever normally follows starts a fresh line rather
// than continuing this one -- there is no established "keep the next
// glyph in place" need the way there is mid-line in a TJ/Tj run.
function buildReplacementOperatorText(plan: EditPlan, bytesPerCode: 1 | 2): string {
  const hex = encodeGlyphCodesToHex(plan.replacementGlyphCodes, bytesPerCode);
  if (plan.operatorType === "Tj") {
    return `<${hex}> Tj`;
  }
  if (plan.operatorType === "'") {
    return `<${hex}> '`;
  }
  if (plan.operatorType === '"') {
    return `${formatPdfNumber(plan.wordSpacing)} ${formatPdfNumber(plan.charSpacing)} <${hex}> "`;
  }
  const needsAdjustment = Math.abs(plan.tjSpacingDelta) >= TJ_DELTA_EPSILON;
  return needsAdjustment ? `[<${hex}> ${formatPdfNumber(plan.tjSpacingDelta)}] TJ` : `[<${hex}>] TJ`;
}

// Pure byte-level rewrite: replaces exactly the operator's own byte range
// (plan.byteOffset .. plan.byteOffset + plan.byteLength) in
// `contentStreamBytes` with a new, self-contained operator invocation
// (see buildReplacementOperatorText) encoding plan.replacementGlyphCodes.
// Nothing outside that range is touched -- every other operator (BT/ET,
// Tf, Tm, other text runs, spacing operators, graphics state) is
// preserved byte-for-byte by construction, not by any explicit "preserve"
// step.
//
// Always emits hex string operand(s) regardless of whether the original
// used literal `(...)` strings -- Tj/TJ accept either form equivalently
// per spec, and hex avoids the literal-string escaping rules entirely
// (no risk of an unescaped '(' or ')' in re-encoded glyph bytes breaking
// the stream's balanced-parens structure).
export function applyEditPlanToBytes(contentStreamBytes: Uint8Array, plan: EditPlan, bytesPerCode: 1 | 2): Uint8Array {
  assertApplicable(plan);

  const newOperatorBytes = new TextEncoder().encode(buildReplacementOperatorText(plan, bytesPerCode));

  const before = contentStreamBytes.subarray(0, plan.byteOffset);
  const after = contentStreamBytes.subarray(plan.byteOffset + plan.byteLength);
  const result = new Uint8Array(before.length + newOperatorBytes.length + after.length);
  result.set(before, 0);
  result.set(newOperatorBytes, before.length);
  result.set(after, before.length + newOperatorBytes.length);
  return result;
}

// Applies one verified EditPlan directly to a loaded PDFDocument's own
// object graph -- decodes the target content stream, rewrites just the
// one operator via applyEditPlanToBytes, and re-registers it as a new
// stream object using the SAME compression the original stream used (so
// the rewrite doesn't silently change every other page's/stream's
// encoding convention). The old stream is explicitly deleted from the
// context afterward: pdf-lib's writer serializes every object still
// registered in the context regardless of reachability (the same
// behavior PR #189's compress work already had to account for when
// swapping an embedded image), so leaving the old stream registered would
// silently bloat the saved file with orphaned bytes.
type LocatedContentStream = {
  context: PDFContext;
  targetRef: PDFRef;
  contentsArray: PDFArray | null;
  originalStream: PDFRawStream;
  decodedBytes: Uint8Array;
};

// Locates and decodes one page's content stream by index (0 for a page
// with a single, non-array /Contents; an index into the array otherwise)
// -- shared by applyEditPlanToDocument and
// lib/pdf/edit/multiRunEditPlan.ts's applyMultiRunEditPlanToDocument,
// since both need to find and decode the exact same target before
// rewriting it (one operator at a time, or several in sequence).
function locateContentStream(doc: PDFDocument, pageIndex: number, contentStreamIndex: number): LocatedContentStream {
  const page = doc.getPages()[pageIndex];
  if (!page) throw new EditPlanRejectedError(`Page ${pageIndex} does not exist in this document.`);

  const context = doc.context;
  const contentsEntry = page.node.get(PDFName.of("Contents"));

  let targetRef: PDFRef;
  let contentsArray: PDFArray | null = null;

  if (contentsEntry instanceof PDFRef) {
    const resolved = context.lookupMaybe(contentsEntry, PDFArray);
    if (resolved) {
      contentsArray = resolved;
      const entryRef = resolved.get(contentStreamIndex);
      if (!(entryRef instanceof PDFRef)) {
        throw new EditPlanRejectedError(`Content stream index ${contentStreamIndex} is not a valid indirect reference.`);
      }
      targetRef = entryRef;
    } else {
      targetRef = contentsEntry;
    }
  } else if (contentsEntry instanceof PDFArray) {
    contentsArray = contentsEntry;
    const entryRef = contentsEntry.get(contentStreamIndex);
    if (!(entryRef instanceof PDFRef)) {
      throw new EditPlanRejectedError(`Content stream index ${contentStreamIndex} is not a valid indirect reference.`);
    }
    targetRef = entryRef;
  } else {
    throw new EditPlanRejectedError("This page's /Contents entry is not an indirect reference; cannot be safely rewritten.");
  }

  const streamCandidate = context.lookup(targetRef, PDFStream);
  if (!(streamCandidate instanceof PDFRawStream)) {
    throw new EditPlanRejectedError("The target content stream is not a raw (undecoded) stream; cannot be safely rewritten.");
  }

  return {
    context,
    targetRef,
    contentsArray,
    originalStream: streamCandidate,
    decodedBytes: decodePDFRawStream(streamCandidate).decode(),
  };
}

// Registers `newBytes` as a new stream object (using the SAME compression
// `originalStream` used, so the rewrite doesn't silently change every
// other page's/stream's encoding convention), swaps the page's /Contents
// reference to it, and explicitly deletes the old stream from the
// context: pdf-lib's writer serializes every object still registered in
// the context regardless of reachability (the same behavior PR #189's
// compress work already had to account for when swapping an embedded
// image), so skipping the delete would silently bloat the saved file with
// orphaned bytes.
function isFlateEncoded(stream: PDFRawStream): boolean {
  const filter = stream.dict.get(PDFName.of("Filter"));
  return filter instanceof PDFName && filter.asString() === "/FlateDecode";
}

// A Form XObject's dict entries (Type/Subtype/BBox/Resources/Matrix/Group,
// etc.) are its identity, not incidental metadata like a page content
// stream's -- context.stream(bytes)/flateStream(bytes) with no dict arg
// only produces {Length}, so writing back a Form's replacement bytes this
// way would silently strip /Subtype /Form and everything else, making the
// XObject unrecognizable on the next read (proven: pdfjs and
// collectPageTextOperators both stopped seeing it). Copies every entry
// from the original stream's dict onto the freshly built one, except
// /Length and /Filter/DecodeParms, which context.stream/flateStream
// already compute correctly for the new bytes/encoding.
function copyStreamDictExceptLengthAndFilter(source: PDFRawStream, target: PDFRawStream): void {
  for (const [key, value] of source.dict.entries()) {
    const name = key.asString();
    if (name === "/Length" || name === "/Filter" || name === "/DecodeParms") continue;
    target.dict.set(key, value);
  }
}

function replaceContentStream(
  page: PDFPage,
  located: LocatedContentStream,
  contentStreamIndex: number,
  newBytes: Uint8Array,
): void {
  const { context, originalStream, targetRef, contentsArray } = located;
  const newStream = isFlateEncoded(originalStream) ? context.flateStream(newBytes) : context.stream(newBytes);
  const newStreamRef = context.register(newStream);

  if (contentsArray) {
    contentsArray.set(contentStreamIndex, newStreamRef);
  } else {
    page.node.set(PDFName.of("Contents"), newStreamRef);
  }
  context.delete(targetRef);
}

// Applies one verified EditPlan directly to a loaded PDFDocument's own
// object graph -- decodes the target content stream, rewrites just the
// one operator via applyEditPlanToBytes, and re-registers it (see
// replaceContentStream).
export async function applyEditPlanToDocument(doc: PDFDocument, plan: EditPlan, bytesPerCode: 1 | 2): Promise<void> {
  assertApplicable(plan);

  if (plan.formPath) {
    const target = resolveStreamTarget(doc, plan.pageIndex, plan.contentStreamIndex, plan.formPath);
    const newBytes = applyEditPlanToBytes(target.decodedBytes, plan, bytesPerCode);
    const wasFlate = isFlateEncoded(target.originalStream);
    const newStream = wasFlate ? target.context.flateStream(newBytes) : target.context.stream(newBytes);
    copyStreamDictExceptLengthAndFilter(target.originalStream, newStream);
    target.writeBack(target.context.register(newStream));
    return;
  }

  const page = doc.getPages()[plan.pageIndex];
  const located = locateContentStream(doc, plan.pageIndex, plan.contentStreamIndex);
  const newBytes = applyEditPlanToBytes(located.decodedBytes, plan, bytesPerCode);
  replaceContentStream(page, located, plan.contentStreamIndex, newBytes);
}

// Applies a verified MultiRunEditPlan (lib/pdf/edit/multiRunEditPlan.ts)
// directly to a loaded PDFDocument -- rewrites every spanned operator's
// sub-plan against the SAME decoded content-stream buffer, one after
// another, in REVERSE operator order (last-in-the-stream first). This is
// required, not a stylistic choice: each sub-plan's byteOffset/byteLength
// were computed against the ORIGINAL (pre-edit) stream, and rewriting an
// earlier (smaller-offset) operator first would change the stream's
// length and silently invalidate every LATER sub-plan's own offsets.
// Applying right-to-left means every edit only ever touches bytes to the
// right of any position a not-yet-applied sub-plan still refers to, so
// each remaining offset stays valid until its own turn.
export async function applyMultiRunEditPlanToDocument(
  doc: PDFDocument,
  plan: MultiRunEditPlan,
  bytesPerCode: 1 | 2,
): Promise<void> {
  if (!plan.editable) {
    throw new EditPlanRejectedError(plan.reason ?? "This multi-run edit plan is not editable.");
  }
  for (const subPlan of plan.subPlans) assertApplicable(subPlan);

  const page = doc.getPages()[plan.pageIndex];
  const located = locateContentStream(doc, plan.pageIndex, plan.contentStreamIndex);

  let bytes = located.decodedBytes;
  for (let i = plan.subPlans.length - 1; i >= 0; i -= 1) {
    bytes = applyEditPlanToBytes(bytes, plan.subPlans[i], bytesPerCode);
  }

  replaceContentStream(page, located, plan.contentStreamIndex, bytes);
}
