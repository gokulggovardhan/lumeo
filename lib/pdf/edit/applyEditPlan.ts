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
// - An EditPlan that isn't already `editable` (built by editPlan.ts, which
//   already enforces this) is rejected here too, as a second, independent
//   check rather than trusting the caller.
// - A plan carrying a substitute font (EditPlan.fallbackFont, see
//   lib/pdf/edit/fallbackFont.ts) additionally wraps the rewritten
//   operator in a Tf pair -- switch to the substitute, show the text,
//   switch straight back -- and registers that font in whichever
//   /Resources /Font dictionary the target stream resolves names against.
//   Still a single-operator, single-byte-range rewrite: the Tf pair goes
//   INSIDE the replaced range, so nothing outside it changes and no
//   later operator can inherit the substitute.

import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream } from "pdf-lib";
import type { PDFContext, PDFDict, PDFPage } from "pdf-lib";
import type { EditPlan } from "./editPlan.ts";
import { ensureFallbackFontResource, resolveFallbackFontsDict } from "./fallbackFont.ts";
import type { SafeLocalReflowPlan } from "./localReflow.ts";
import type { MultiRunEditPlan } from "./multiRunEditPlan.ts";
import { resolveStreamTarget, resolveIsolatedStreamTarget } from "./formXObjects.ts";

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
}

function formatPdfNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded.toString();
}

const TJ_DELTA_EPSILON = 0.01;

function encodePdfName(name: string): string {
  let out = "/";
  for (let i = 0; i < name.length; i += 1) {
    const code = name.charCodeAt(i);
    const char = name[i];
    const isRegular = code > 0x20 && code < 0x7f && char !== "#" && !"()<>[]{}/%".includes(char);
    out += isRegular ? char : `#${code.toString(16).padStart(2, "0")}`;
  }
  return out;
}

function buildFallbackOperatorText(plan: EditPlan, fallbackResourceName: string): string {
  const fallback = plan.fallbackFont;
  if (!fallback) throw new EditPlanRejectedError("This plan does not use a substitute font.");

  const hex = encodeGlyphCodesToHex(plan.replacementGlyphCodes, fallback.bytesPerCode);
  const size = formatPdfNumber(plan.fontSizePt);
  const selectSubstitute = `${encodePdfName(fallbackResourceName)} ${size} Tf`;
  const restoreOriginal = `${encodePdfName(fallback.originalFontResourceName)} ${size} Tf`;

  let show: string;
  if (plan.operatorType === "'") {
    show = `<${hex}> '`;
  } else if (plan.operatorType === '"') {
    show = `${formatPdfNumber(plan.wordSpacing)} ${formatPdfNumber(plan.charSpacing)} <${hex}> "`;
  } else {
    const needsAdjustment = Math.abs(plan.tjSpacingDelta) >= TJ_DELTA_EPSILON;
    show = needsAdjustment ? `[<${hex}> ${formatPdfNumber(plan.tjSpacingDelta)}] TJ` : `[<${hex}>] TJ`;
  }

  return `${selectSubstitute} ${show} ${restoreOriginal}`;
}

function buildReplacementOperatorText(plan: EditPlan, bytesPerCode: 1 | 2): string {
  const hex = encodeGlyphCodesToHex(plan.replacementGlyphCodes, bytesPerCode);
  if (plan.operatorType === "Tj") {
    const needsAdjustment =
      Boolean(plan.replacementTextState) &&
      Math.abs(plan.tjSpacingDelta) >= TJ_DELTA_EPSILON;
    return needsAdjustment
      ? `[<${hex}> ${formatPdfNumber(plan.tjSpacingDelta)}] TJ`
      : `<${hex}> Tj`;
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

function buildTextStateOverrideWrapper(plan: EditPlan): { prefix: string; suffix: string } {
  const target = plan.replacementTextState;
  if (!target) return { prefix: "", suffix: "" };

  const before: string[] = [];
  const after: string[] = [];

  if (target.fontSizePt !== plan.fontSizePt) {
    if (!plan.fontResourceName) {
      throw new EditPlanRejectedError(
        "This text's font resource could not be identified, so its size cannot be changed safely.",
      );
    }
    before.push(
      `${encodePdfName(plan.fontResourceName)} ${formatPdfNumber(target.fontSizePt)} Tf`,
    );
    after.unshift(
      `${encodePdfName(plan.fontResourceName)} ${formatPdfNumber(plan.fontSizePt)} Tf`,
    );
  }

  if (target.charSpacing !== plan.charSpacing) {
    before.push(`${formatPdfNumber(target.charSpacing)} Tc`);
    after.unshift(`${formatPdfNumber(plan.charSpacing)} Tc`);
  }

  if (target.wordSpacing !== plan.wordSpacing) {
    before.push(`${formatPdfNumber(target.wordSpacing)} Tw`);
    after.unshift(`${formatPdfNumber(plan.wordSpacing)} Tw`);
  }

  if (target.horizontalScalingPct !== plan.horizontalScalingPct) {
    before.push(`${formatPdfNumber(target.horizontalScalingPct)} Tz`);
    after.unshift(`${formatPdfNumber(plan.horizontalScalingPct)} Tz`);
  }

  return {
    prefix: before.join(" "),
    suffix: after.join(" "),
  };
}

export function applyEditPlanToBytes(
  contentStreamBytes: Uint8Array,
  plan: EditPlan,
  bytesPerCode: 1 | 2,
  options: { fallbackResourceName?: string } = {},
): Uint8Array {
  assertApplicable(plan);

  let operatorText: string;
  if (plan.fallbackFont) {
    if (!options.fallbackResourceName) {
      throw new EditPlanRejectedError(
        "This edit needs a substitute font, but no resource name was supplied for it -- the font must be registered in the target stream's /Resources /Font first.",
      );
    }
    operatorText = buildFallbackOperatorText(plan, options.fallbackResourceName);
  } else {
    operatorText = buildReplacementOperatorText(plan, bytesPerCode);
  }

  const textState = buildTextStateOverrideWrapper(plan);
  if (textState.prefix || textState.suffix) {
    operatorText = [textState.prefix, operatorText, textState.suffix]
      .filter(Boolean)
      .join(" ");
  }

  const newOperatorBytes = new TextEncoder().encode(operatorText);
  const before = contentStreamBytes.subarray(0, plan.byteOffset);
  const after = contentStreamBytes.subarray(plan.byteOffset + plan.byteLength);
  const result = new Uint8Array(before.length + newOperatorBytes.length + after.length);
  result.set(before, 0);
  result.set(newOperatorBytes, before.length);
  result.set(after, before.length + newOperatorBytes.length);
  return result;
}

type LocatedContentStream = {
  context: PDFContext;
  targetRef: PDFRef;
  contentsArray: PDFArray | null;
  originalStream: PDFRawStream;
  decodedBytes: Uint8Array;
};

function locateContentStream(doc: PDFDocument, pageIndex: number, contentStreamIndex: number): LocatedContentStream {
  const page = doc.getPages()[pageIndex];
  if (!page) throw new EditPlanRejectedError(`Page ${pageIndex} does not exist in this document.`);

  const context = doc.context;
  const contentsEntry = page.node.get(PDFName.of("Contents"));

  let targetRef: PDFRef;
  let contentsArray: PDFArray | null = null;

  if (contentsEntry instanceof PDFRef) {
    const untyped = context.lookup(contentsEntry);
    const resolved = untyped instanceof PDFArray ? untyped : undefined;
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

function isFlateEncoded(stream: PDFRawStream): boolean {
  const filter = stream.dict.get(PDFName.of("Filter"));
  return filter instanceof PDFName && filter.asString() === "/FlateDecode";
}

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

export async function applyEditPlanToDocument(
  doc: PDFDocument,
  plan: EditPlan,
  bytesPerCode: 1 | 2,
  options: { isolate?: boolean } = {},
): Promise<void> {
  assertApplicable(plan);

  if (plan.formPath) {
    const target = options.isolate
      ? resolveIsolatedStreamTarget(doc, plan.pageIndex, plan.contentStreamIndex, plan.formPath)
      : resolveStreamTarget(doc, plan.pageIndex, plan.contentStreamIndex, plan.formPath);
    const fallbackResourceName = await registerFallbackFont(doc, plan, target.originalStream.dict);
    const newBytes = applyEditPlanToBytes(target.decodedBytes, plan, bytesPerCode, { fallbackResourceName });
    const wasFlate = isFlateEncoded(target.originalStream);
    const newStream = wasFlate ? target.context.flateStream(newBytes) : target.context.stream(newBytes);
    copyStreamDictExceptLengthAndFilter(target.originalStream, newStream);
    target.writeBack(target.context.register(newStream));
    return;
  }

  const page = doc.getPages()[plan.pageIndex];
  const located = locateContentStream(doc, plan.pageIndex, plan.contentStreamIndex);
  const fallbackResourceName = await registerFallbackFont(doc, plan, null);
  const newBytes = applyEditPlanToBytes(located.decodedBytes, plan, bytesPerCode, { fallbackResourceName });
  replaceContentStream(page, located, plan.contentStreamIndex, newBytes);
}

async function registerFallbackFont(
  doc: PDFDocument,
  plan: EditPlan,
  formStreamDict: PDFDict | null,
): Promise<string | undefined> {
  if (!plan.fallbackFont) return undefined;
  const fontsDict = resolveFallbackFontsDict(doc, plan.pageIndex, formStreamDict);
  return ensureFallbackFontResource(doc, fontsDict, plan.fallbackFont.family);
}

export async function applyMultiRunEditPlanToDocument(
  doc: PDFDocument,
  plan: MultiRunEditPlan,
  bytesPerCode: 1 | 2,
): Promise<void> {
  if (!plan.editable) {
    throw new EditPlanRejectedError(plan.reason ?? "This multi-run edit plan is not editable.");
  }
  for (const subPlan of plan.subPlans) assertApplicable(subPlan);
  if (plan.subPlans.some((subPlan) => subPlan.fallbackFont)) {
    throw new EditPlanRejectedError("Multi-line edits can't use a substitute font -- edit these lines one at a time.");
  }

  const page = doc.getPages()[plan.pageIndex];
  const located = locateContentStream(doc, plan.pageIndex, plan.contentStreamIndex);

  let bytes = located.decodedBytes;
  for (let i = plan.subPlans.length - 1; i >= 0; i -= 1) {
    bytes = applyEditPlanToBytes(bytes, plan.subPlans[i], bytesPerCode);
  }

  replaceContentStream(page, located, plan.contentStreamIndex, bytes);
}

/**
 * Applies a proven local-reflow plan as one atomic page-content rewrite.
 *
 * All operator byte offsets in a reflow plan refer to the same original
 * decoded stream, so edits are flattened and applied right-to-left. This is
 * the same offset-preservation rule used by MultiRunEditPlan, extended across
 * several existing line slots. No new text matrices, line origins, resources
 * or graphics-state operators are introduced here.
 */
export async function applySafeLocalReflowPlanToDocument(
  doc: PDFDocument,
  plan: SafeLocalReflowPlan,
  bytesPerCode: 1 | 2,
): Promise<void> {
  if (!plan.editable) {
    throw new EditPlanRejectedError(plan.reason ?? "This local reflow plan is not editable.");
  }

  const flatPlans = plan.linePlans.flatMap((line) =>
    line.kind === "single" ? [line.plan] : line.plan.subPlans,
  );
  if (flatPlans.length === 0) {
    throw new EditPlanRejectedError("This local reflow plan contains no text edits.");
  }

  for (const edit of flatPlans) {
    assertApplicable(edit);
    if (
      edit.pageIndex !== plan.pageIndex ||
      edit.contentStreamIndex !== plan.contentStreamIndex ||
      edit.formPath !== null ||
      edit.fallbackFont !== null ||
      edit.replacementTextState !== null
    ) {
      throw new EditPlanRejectedError(
        "Local reflow must remain inside one page content stream, one verified font, and the existing text state.",
      );
    }
  }

  const offsets = new Set(flatPlans.map((edit) => edit.byteOffset));
  if (offsets.size !== flatPlans.length) {
    throw new EditPlanRejectedError("Local reflow contains overlapping text operator ownership.");
  }

  const page = doc.getPages()[plan.pageIndex];
  const located = locateContentStream(doc, plan.pageIndex, plan.contentStreamIndex);
  let bytes = located.decodedBytes;
  for (const edit of [...flatPlans].sort((a, b) => b.byteOffset - a.byteOffset)) {
    bytes = applyEditPlanToBytes(bytes, edit, bytesPerCode);
  }
  replaceContentStream(page, located, plan.contentStreamIndex, bytes);
}
