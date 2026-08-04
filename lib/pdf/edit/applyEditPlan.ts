// lib/pdf/edit/applyEditPlan.ts
//
// Phase 3 of true PDF text editing: real content-stream mutation. Given a
// verified EditPlan (lib/pdf/edit/editPlan.ts), rewrites exactly one
// Tj or TJ operator's text operand(s) -- nothing else in the content
// stream, and nothing else in the PDF's object graph, changes.
//
// Deliberately narrow, per the approved slice scope:
// - Only Tj and TJ are supported; ' and " are rejected outright -- each
//   also moves the text line as a side effect of showing text, a
//   different, riskier change than either supported operator's.
// - A TJ rewrite always collapses to a single combined string operand
//   (see buildReplacementOperatorText) plus, when needed, one trailing
//   spacing-adjustment number computed by fontMetrics.ts's compareAdvance
//   -- the original's own inter-string kerning numbers are dropped, since
//   they were tuned for the original text's specific glyph boundaries and
//   have no coherent meaning once the text changes.
// - No fallback-font path -- an EditPlan that isn't already `editable`
//   (built by editPlan.ts, which already enforces this) is rejected here
//   too, as a second, independent check rather than trusting the caller.

import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream } from "pdf-lib";
import type { EditPlan } from "./editPlan.ts";

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

const SUPPORTED_OPERATOR_TYPES: ReadonlySet<EditPlan["operatorType"]> = new Set(["Tj", "TJ"]);

function assertApplicable(plan: EditPlan): void {
  if (!plan.editable) {
    throw new EditPlanRejectedError(plan.reason ?? "This edit plan is not editable.");
  }
  if (!SUPPORTED_OPERATOR_TYPES.has(plan.operatorType)) {
    throw new EditPlanRejectedError(
      `This rewrite engine only supports Tj and TJ operators (this plan targets "${plan.operatorType}"). ' and " support is separate, later work.`,
    );
  }
  if (plan.operatorType === "TJ" && plan.replacementGlyphCodes.length === 0 && plan.originalGlyphCodes.length > 0) {
    // A TJ rewritten down to zero glyphs would still be syntactically
    // valid PDF ([] TJ), but it's a degenerate case this slice doesn't
    // have a real reproduced example to validate against -- reject
    // rather than guess it's safe.
    throw new EditPlanRejectedError("Replacing a TJ run with empty text is not supported by this rewrite engine.");
  }
}

// A TJ array's own kerning-adjustment numbers can carry several decimal
// places; format with just enough precision to round-trip through the
// tokenizer cleanly without accumulating stray floating-point noise like
// "12.000000000000002".
function formatTJNumber(value: number): string {
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
// `<hex> Tj` for a Tj plan, or `[<hex>] TJ` / `[<hex> delta] TJ` for a TJ
// plan. A TJ replacement always collapses to a single combined string
// operand (task 3: rewrite only text operands) -- the original's own
// inter-string kerning numbers are dropped rather than kept, since they
// were tuned for the ORIGINAL text's specific glyph boundaries and have
// no coherent attachment point once the text itself changes (task 4:
// leave spacing operands untouched *unless recalculation is required* --
// here it is required, because the numbers' meaning doesn't survive the
// edit). In their place, a single trailing adjustment equal to
// plan.tjSpacingDelta (already computed by lib/pdf/edit/fontMetrics.ts's
// compareAdvance in the EditPlan slice, task 5: use the existing spacing
// engine) keeps whatever text follows this operator from shifting
// position -- omitted entirely when negligible, so an equal-width
// replacement produces a clean `[<hex>] TJ` with no adjustment at all.
function buildReplacementOperatorText(plan: EditPlan, bytesPerCode: 1 | 2): string {
  const hex = encodeGlyphCodesToHex(plan.replacementGlyphCodes, bytesPerCode);
  if (plan.operatorType === "Tj") {
    return `<${hex}> Tj`;
  }
  const needsAdjustment = Math.abs(plan.tjSpacingDelta) >= TJ_DELTA_EPSILON;
  return needsAdjustment ? `[<${hex}> ${formatTJNumber(plan.tjSpacingDelta)}] TJ` : `[<${hex}>] TJ`;
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
export async function applyEditPlanToDocument(doc: PDFDocument, plan: EditPlan, bytesPerCode: 1 | 2): Promise<void> {
  assertApplicable(plan);

  const page = doc.getPages()[plan.pageIndex];
  if (!page) throw new EditPlanRejectedError(`Page ${plan.pageIndex} does not exist in this document.`);

  const context = doc.context;
  const contentsEntry = page.node.get(PDFName.of("Contents"));

  let targetRef: PDFRef;
  let contentsArray: PDFArray | null = null;

  if (contentsEntry instanceof PDFRef) {
    const resolved = context.lookupMaybe(contentsEntry, PDFArray);
    if (resolved) {
      contentsArray = resolved;
      const entryRef = resolved.get(plan.contentStreamIndex);
      if (!(entryRef instanceof PDFRef)) {
        throw new EditPlanRejectedError(`Content stream index ${plan.contentStreamIndex} is not a valid indirect reference.`);
      }
      targetRef = entryRef;
    } else {
      targetRef = contentsEntry;
    }
  } else if (contentsEntry instanceof PDFArray) {
    contentsArray = contentsEntry;
    const entryRef = contentsEntry.get(plan.contentStreamIndex);
    if (!(entryRef instanceof PDFRef)) {
      throw new EditPlanRejectedError(`Content stream index ${plan.contentStreamIndex} is not a valid indirect reference.`);
    }
    targetRef = entryRef;
  } else {
    throw new EditPlanRejectedError("This page's /Contents entry is not an indirect reference; cannot be safely rewritten.");
  }

  const streamCandidate = context.lookup(targetRef, PDFStream);
  if (!(streamCandidate instanceof PDFRawStream)) {
    throw new EditPlanRejectedError("The target content stream is not a raw (undecoded) stream; cannot be safely rewritten.");
  }
  const originalStream = streamCandidate;
  const decodedBytes = decodePDFRawStream(originalStream).decode();
  const newBytes = applyEditPlanToBytes(decodedBytes, plan, bytesPerCode);

  const filter = originalStream.dict.get(PDFName.of("Filter"));
  const wasFlate = filter instanceof PDFName && filter.asString() === "/FlateDecode";
  const newStream = wasFlate ? context.flateStream(newBytes) : context.stream(newBytes);
  const newStreamRef = context.register(newStream);

  if (contentsArray) {
    contentsArray.set(plan.contentStreamIndex, newStreamRef);
  } else {
    page.node.set(PDFName.of("Contents"), newStreamRef);
  }
  context.delete(targetRef);
}
