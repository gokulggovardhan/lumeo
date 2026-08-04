// lib/pdf/edit/applyEditPlan.ts
//
// Phase 3 of true PDF text editing, slice 1: the first real content-stream
// mutation. Given a verified EditPlan (lib/pdf/edit/editPlan.ts), rewrites
// exactly one Tj operator's string operand -- nothing else in the content
// stream, and nothing else in the PDF's object graph, changes.
//
// Deliberately narrow, per the approved slice scope:
// - Only Tj is supported (TJ, ', " are all rejected outright -- TJ's
//   interleaved kerning-number array makes a safe rewrite a materially
//   different, larger problem than a single string operand).
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

function assertApplicable(plan: EditPlan): void {
  if (!plan.editable) {
    throw new EditPlanRejectedError(plan.reason ?? "This edit plan is not editable.");
  }
  if (plan.operatorType !== "Tj") {
    throw new EditPlanRejectedError(
      `This rewrite engine only supports Tj operators (this plan targets "${plan.operatorType}"). TJ support is separate, later work.`,
    );
  }
}

// Pure byte-level rewrite: replaces exactly the operator's own byte range
// (plan.byteOffset .. plan.byteOffset + plan.byteLength) in
// `contentStreamBytes` with a new, self-contained `<hex> Tj` invocation
// encoding plan.replacementGlyphCodes. Nothing outside that range is
// touched -- every other operator (BT/ET, Tf, Tm, other text runs,
// spacing operators, graphics state) is preserved byte-for-byte by
// construction, not by any explicit "preserve" step.
//
// Always emits a hex string operand regardless of whether the original
// used a literal `(...)` string -- Tj accepts either form equivalently
// per spec, and hex avoids the literal-string escaping rules entirely
// (no risk of an unescaped '(' or ')' in re-encoded glyph bytes breaking
// the stream's balanced-parens structure).
export function applyEditPlanToBytes(contentStreamBytes: Uint8Array, plan: EditPlan, bytesPerCode: 1 | 2): Uint8Array {
  assertApplicable(plan);

  const hex = encodeGlyphCodesToHex(plan.replacementGlyphCodes, bytesPerCode);
  const newOperatorBytes = new TextEncoder().encode(`<${hex}> Tj`);

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
