import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
} from "pdf-lib";
import type { Matrix2x3, TextShowOperator } from "./contentStream.ts";
import {
  buildEditPlan,
  isValidatedEditPlan,
  type ValidatedEditPlan,
} from "./editPlan.ts";
import type { EmbeddedGlyphEvidence, ResolvedFont } from "./fontEncoding.ts";
import type { FontMetrics } from "./fontMetrics.ts";
import {
  collectPageTextOperators,
  resolveStreamTarget,
} from "./formXObjects.ts";
import {
  PdfFontRegistry,
  type PdfFontResourceIdentity,
} from "./fontRegistry.ts";
import {
  localCustomFontTextIssue,
  type LocalCustomFontAsset,
} from "./localCustomFont.ts";
import {
  shapeEmbeddedFontText,
  type ShapedRun,
} from "./harfbuzzShaping.ts";
import { detectComplexShapingRequirement } from "./shapingWriteGuard.ts";
import { resolveFallbackFontsDict } from "./fallbackFont.ts";
import { sha256Hex } from "./sha256.ts";

const MATRIX_EPSILON = 1e-9;
const ADVANCE_EPSILON_FONT_UNITS = 0.01;
const TJ_DELTA_EPSILON = 0.01;
const LOCAL_NATIVE_RESOURCE_PREFIX = "LumeoNativeLocal";

type SourceFontBinding = Readonly<{
  fontObjectRef: string | null;
  descriptorObjectRef: string | null;
  descendantObjectRef: string | null;
  fontProgramObjectRef: string | null;
  toUnicodeObjectRef: string | null;
  encodingObjectRef: string | null;
  writingMode: PdfFontResourceIdentity["writingMode"];
}>;

type OperatorSnapshot = Readonly<{
  kind: "Tj" | "TJ";
  renderMode: number;
  fontSizePt: number;
  charSpacing: number;
  wordSpacing: number;
  horizontalScalingPct: number;
  textRise: number;
  textRenderingMatrix: Matrix2x3 | null;
  textLineMatrix: Matrix2x3 | null;
  ctm: Matrix2x3 | null;
}>;

type LocalFontShapingProof = Readonly<{
  glyphIds: readonly number[];
  unitsPerEm: number;
  engineVersion: string;
}>;

type LocalFontSubstitutionPlanFields = Readonly<{
  pageIndex: number;
  contentStreamIndex: number;
  operatorIndex: number;
  originalText: string;
  replacementText: string;
  originalFontResourceName: string;
  originalEffectiveAdvancePt: number;
  fontSizePt: number;
  charSpacing: number;
  horizontalScalingPct: number;
  sourcePlan: ValidatedEditPlan;
  sourceBinding: SourceFontBinding;
  operatorSnapshot: OperatorSnapshot;
  localFontAssetId: string;
  localFontSha256: string;
  localFontFamilyName: string;
  shapingProof: LocalFontShapingProof;
}>;

class ValidatedLocalFontSubstitutionPlanProof {
  private readonly validationProof!: true;

  constructor() {
    Object.defineProperty(this, "validationProof", {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }

  isPlannerIssued(): boolean {
    return this.validationProof === true;
  }
}

export type ValidatedLocalFontSubstitutionPlan =
  LocalFontSubstitutionPlanFields &
  ValidatedLocalFontSubstitutionPlanProof &
  Readonly<{
    editable: true;
    reason: null;
  }>;

export type RejectedLocalFontSubstitutionPlan = Readonly<{
  editable: false;
  reason: string;
  pageIndex: number;
  contentStreamIndex: number;
  operatorIndex: number;
  replacementText: string;
  localFontAssetId: string | null;
}>;

export type LocalFontSubstitutionPlan =
  | ValidatedLocalFontSubstitutionPlan
  | RejectedLocalFontSubstitutionPlan;

export type LocalFontSubstitutionWriteResult = Readonly<{
  bytes: Uint8Array;
  resourceName: string;
  embeddedProgramSha256: string;
  verifiedText: string;
}>;

type ShapeLocalFont = (
  bytes: Uint8Array,
  text: string,
  options: { direction: "ltr" },
) => Promise<ShapedRun>;

function reject(
  reason: string,
  {
    pageIndex,
    contentStreamIndex,
    operatorIndex,
    replacementText,
    asset,
  }: {
    pageIndex: number;
    contentStreamIndex: number;
    operatorIndex: number;
    replacementText: string;
    asset: LocalCustomFontAsset | null;
  },
): RejectedLocalFontSubstitutionPlan {
  return {
    editable: false,
    reason,
    pageIndex,
    contentStreamIndex,
    operatorIndex,
    replacementText,
    localFontAssetId: asset?.descriptor.id ?? null,
  };
}

function cloneMatrix(matrix: Matrix2x3 | null | undefined): Matrix2x3 | null {
  return matrix ? ([...matrix] as Matrix2x3) : null;
}

function matrixEqual(
  left: Matrix2x3 | null | undefined,
  right: Matrix2x3 | null | undefined,
): boolean {
  if (!left || !right) return left == null && right == null;
  return left.every(
    (value, index) => Math.abs(value - right[index]) <= MATRIX_EPSILON,
  );
}

function sourceBinding(
  identity: PdfFontResourceIdentity,
): SourceFontBinding {
  return {
    fontObjectRef: identity.fontObjectRef,
    descriptorObjectRef: identity.descriptorObjectRef,
    descendantObjectRef: identity.descendantObjectRef,
    fontProgramObjectRef: identity.fontProgramObjectRef,
    toUnicodeObjectRef: identity.toUnicodeObjectRef,
    encodingObjectRef: identity.encodingObjectRef,
    writingMode: identity.writingMode,
  };
}

function sourceBindingEqual(
  expected: SourceFontBinding,
  actual: PdfFontResourceIdentity,
): boolean {
  return (
    expected.fontObjectRef === actual.fontObjectRef &&
    expected.descriptorObjectRef === actual.descriptorObjectRef &&
    expected.descendantObjectRef === actual.descendantObjectRef &&
    expected.fontProgramObjectRef === actual.fontProgramObjectRef &&
    expected.toUnicodeObjectRef === actual.toUnicodeObjectRef &&
    expected.encodingObjectRef === actual.encodingObjectRef &&
    expected.writingMode === actual.writingMode
  );
}

function snapshotOperator(operator: TextShowOperator): OperatorSnapshot | null {
  if (operator.kind !== "Tj" && operator.kind !== "TJ") return null;
  return {
    kind: operator.kind,
    renderMode: operator.renderMode,
    fontSizePt: operator.fontSizePt,
    charSpacing: operator.charSpacing,
    wordSpacing: operator.wordSpacing,
    horizontalScalingPct: operator.horizontalScalingPct,
    textRise: operator.textRise,
    textRenderingMatrix: cloneMatrix(operator.textRenderingMatrix),
    textLineMatrix: cloneMatrix(operator.textLineMatrix),
    ctm: cloneMatrix(operator.ctm),
  };
}

function operatorSnapshotEqual(
  expected: OperatorSnapshot,
  actual: TextShowOperator,
): boolean {
  return (
    actual.kind === expected.kind &&
    actual.renderMode === expected.renderMode &&
    actual.fontSizePt === expected.fontSizePt &&
    actual.charSpacing === expected.charSpacing &&
    actual.wordSpacing === expected.wordSpacing &&
    actual.horizontalScalingPct === expected.horizontalScalingPct &&
    actual.textRise === expected.textRise &&
    matrixEqual(expected.textRenderingMatrix, actual.textRenderingMatrix) &&
    matrixEqual(expected.textLineMatrix, actual.textLineMatrix) &&
    matrixEqual(expected.ctm, actual.ctm)
  );
}

function arraysEqual(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sourcePlanEqual(
  expected: ValidatedEditPlan,
  actual: ValidatedEditPlan,
): boolean {
  return (
    expected.pageIndex === actual.pageIndex &&
    expected.contentStreamIndex === actual.contentStreamIndex &&
    expected.operatorIndex === actual.operatorIndex &&
    expected.operatorType === actual.operatorType &&
    expected.fontResourceName === actual.fontResourceName &&
    expected.originalText === actual.originalText &&
    expected.byteOffset === actual.byteOffset &&
    expected.byteLength === actual.byteLength &&
    Math.abs(expected.originalWidthPt - actual.originalWidthPt) <= 1e-9 &&
    arraysEqual(expected.originalGlyphCodes, actual.originalGlyphCodes)
  );
}

function assetIdentityIsCurrent(asset: LocalCustomFontAsset): boolean {
  return (
    /^[a-f0-9]{64}$/i.test(asset.descriptor.sha256) &&
    asset.descriptor.id === `local-font-${asset.descriptor.sha256}` &&
    sha256Hex(asset.bytes).toLowerCase() ===
      asset.descriptor.sha256.toLowerCase()
  );
}

function simpleLocalFontShapingProof({
  asset,
  replacementText,
  shaped,
}: {
  asset: LocalCustomFontAsset;
  replacementText: string;
  shaped: ShapedRun;
}): { ok: true; proof: LocalFontShapingProof } | { ok: false; reason: string } {
  const unitsPerEm = asset.intelligence.metadata.unitsPerEm;
  if (
    !unitsPerEm ||
    unitsPerEm <= 0 ||
    shaped.unitsPerEm !== unitsPerEm
  ) {
    return {
      ok: false,
      reason:
        "The local font's shaping units could not be reconciled with its inspected metrics.",
    };
  }

  if (
    shaped.requestedDirection !== "ltr" ||
    !shaped.directionWasExplicit ||
    shaped.totalYAdvance !== 0
  ) {
    return {
      ok: false,
      reason:
        "This first native local-font substitution path supports only explicit horizontal LTR shaping.",
    };
  }

  const characters = Array.from(replacementText);
  if (
    shaped.glyphs.length !== characters.length ||
    shaped.clusterMap.length !== characters.length
  ) {
    return {
      ok: false,
      reason:
        "This local font requires glyph substitution or cluster expansion for the replacement text, so direct native font substitution remains read-only.",
    };
  }

  const glyphIds: number[] = [];
  for (let index = 0; index < characters.length; index += 1) {
    const cluster = shaped.clusterMap[index];
    if (
      !cluster ||
      Array.from(cluster.text).length !== 1 ||
      cluster.text !== characters[index] ||
      cluster.glyphIndices.length !== 1
    ) {
      return {
        ok: false,
        reason:
          "This local font requires non-trivial text shaping for the replacement text.",
      };
    }

    const glyphIndex = cluster.glyphIndices[0];
    const glyph = shaped.glyphs[glyphIndex];
    if (!glyph) {
      return {
        ok: false,
        reason: "HarfBuzz returned an incomplete local-font glyph mapping.",
      };
    }

    const codePoint = characters[index].codePointAt(0);
    const expectedGlyphId =
      codePoint === undefined
        ? null
        : asset.intelligence.glyphIdForCodePoint(codePoint);
    const expectedAdvance =
      expectedGlyphId === null
        ? null
        : asset.intelligence.advanceWidthForGlyphId(expectedGlyphId);

    if (
      expectedGlyphId === null ||
      expectedAdvance === null ||
      glyph.glyphId !== expectedGlyphId
    ) {
      return {
        ok: false,
        reason:
          "The local font's inspected Unicode-to-glyph mapping disagrees with HarfBuzz.",
      };
    }

    if (
      glyph.xOffset !== 0 ||
      glyph.yOffset !== 0 ||
      glyph.yAdvance !== 0 ||
      Math.abs(glyph.xAdvance - expectedAdvance) >
        ADVANCE_EPSILON_FONT_UNITS
    ) {
      return {
        ok: false,
        reason:
          "This local font requires kerning/GPOS or per-glyph positioning that the first native substitution writer does not yet reproduce.",
      };
    }

    glyphIds.push(glyph.glyphId);
  }

  return {
    ok: true,
    proof: {
      glyphIds: Object.freeze(glyphIds),
      unitsPerEm,
      engineVersion: shaped.engineVersion,
    },
  };
}

function issueValidatedPlan(
  fields: LocalFontSubstitutionPlanFields,
): ValidatedLocalFontSubstitutionPlan {
  const plan = Object.assign(
    new ValidatedLocalFontSubstitutionPlanProof(),
    fields,
    { editable: true as const, reason: null },
  ) as ValidatedLocalFontSubstitutionPlan;

  Object.freeze(plan.sourceBinding);
  Object.freeze(plan.operatorSnapshot.textRenderingMatrix);
  Object.freeze(plan.operatorSnapshot.textLineMatrix);
  Object.freeze(plan.operatorSnapshot.ctm);
  Object.freeze(plan.operatorSnapshot);
  Object.freeze(plan.shapingProof.glyphIds);
  Object.freeze(plan.shapingProof);
  Object.freeze(plan);
  return plan;
}

export function isValidatedLocalFontSubstitutionPlan(
  plan: LocalFontSubstitutionPlan,
): plan is ValidatedLocalFontSubstitutionPlan {
  return (
    plan instanceof ValidatedLocalFontSubstitutionPlanProof &&
    plan.isPlannerIssued() &&
    plan.editable === true &&
    plan.reason === null &&
    Object.isFrozen(plan)
  );
}

export async function buildLocalFontSubstitutionPlan({
  pageIndex,
  contentStreamIndex,
  operatorIndex,
  operator,
  replacementText,
  resolvedFont,
  fontMetrics,
  sourceResourceIdentity,
  embeddedGlyphEvidence = null,
  asset,
  shapeFont = shapeEmbeddedFontText,
}: {
  pageIndex: number;
  contentStreamIndex: number;
  operatorIndex: number;
  operator: TextShowOperator;
  replacementText: string;
  resolvedFont: ResolvedFont;
  fontMetrics: FontMetrics;
  sourceResourceIdentity: PdfFontResourceIdentity;
  embeddedGlyphEvidence?: EmbeddedGlyphEvidence | null;
  asset: LocalCustomFontAsset | null;
  shapeFont?: ShapeLocalFont;
}): Promise<LocalFontSubstitutionPlan> {
  const rejectHere = (reason: string) =>
    reject(reason, {
      pageIndex,
      contentStreamIndex,
      operatorIndex,
      replacementText,
      asset,
    });

  if (!asset) {
    return rejectHere("Choose a local .ttf or .otf font first.");
  }
  if (!assetIdentityIsCurrent(asset)) {
    return rejectHere(
      "The selected local font bytes no longer match their verified browser-session fingerprint.",
    );
  }
  if (!replacementText) {
    return rejectHere(
      "Choose a local font only when the replacement contains visible text.",
    );
  }
  if (/[
	]/.test(replacementText)) {
    return rejectHere(
      "Native local-font substitution is currently limited to one text line without tabs.",
    );
  }
  if (operator.kind !== "Tj" && operator.kind !== "TJ") {
    return rejectHere(
      "Native local-font substitution is currently limited to Tj/TJ text runs.",
    );
  }
  if (operator.renderMode === 3) {
    return rejectHere(
      "Invisible searchable text remains read-only to native local-font substitution.",
    );
  }
  if (operator.renderMode >= 4) {
    return rejectHere(
      "Clipping text remains read-only because changing its font would also change the clipping path.",
    );
  }
  if (
    resolvedFont.kind === "Type0" &&
    sourceResourceIdentity.writingMode !== "horizontal"
  ) {
    return rejectHere(
      "Native local-font substitution is currently limited to horizontal PDF text.",
    );
  }
  if (sourceResourceIdentity.writingMode === "vertical") {
    return rejectHere(
      "Native local-font substitution is currently limited to horizontal PDF text.",
    );
  }
  if (Math.abs(operator.wordSpacing) > 1e-9) {
    return rejectHere(
      "This run uses native PDF word spacing. The first local-font substitution writer keeps such runs read-only because embedded composite fonts interpret Tw differently.",
    );
  }
  if (!operator.fontResourceName) {
    return rejectHere(
      "The original PDF font resource could not be identified.",
    );
  }

  const shapingRequirement = detectComplexShapingRequirement(replacementText);
  if (shapingRequirement.required) {
    return rejectHere(
      `${shapingRequirement.reason} The first local-font substitution writer supports only simple LTR shaping.`,
    );
  }

  const issue = localCustomFontTextIssue(asset, replacementText);
  if (issue) return rejectHere(issue);

  const decodedOriginalPlan = buildEditPlan({
    pageIndex,
    contentStreamIndex,
    operatorIndex,
    operator,
    replacementText: (() => {
      const codes = operator.strings.flatMap((bytes) =>
        resolvedFont.bytesPerCode === 1
          ? Array.from(bytes)
          : Array.from(
              { length: Math.floor(bytes.byteLength / 2) },
              (_unused, index) =>
                (bytes[index * 2] << 8) | bytes[index * 2 + 1],
            ),
      );
      return codes
        .map((code) => resolvedFont.glyphCodeToUnicode.get(code) ?? "")
        .join("");
    })(),
    resolvedFont,
    fontMetrics,
    embeddedGlyphEvidence,
  });
  if (!isValidatedEditPlan(decodedOriginalPlan)) {
    return rejectHere(
      decodedOriginalPlan.reason ||
        "The original native text run is not safe enough for font substitution.",
    );
  }
  if (!decodedOriginalPlan.originalText) {
    return rejectHere("The original native text run is empty.");
  }

  let shaped: ShapedRun;
  try {
    shaped = await shapeFont(asset.bytes, replacementText, {
      direction: "ltr",
    });
  } catch (error) {
    return rejectHere(
      error instanceof Error
        ? `The local font could not be shaped safely: ${error.message}`
        : "The local font could not be shaped safely.",
    );
  }
  const simpleShaping = simpleLocalFontShapingProof({
    asset,
    replacementText,
    shaped,
  });
  if (!simpleShaping.ok) return rejectHere(simpleShaping.reason);

  const snapshot = snapshotOperator(operator);
  if (!snapshot) {
    return rejectHere(
      "The native text operator is not supported for local-font substitution.",
    );
  }

  return issueValidatedPlan({
    pageIndex,
    contentStreamIndex,
    operatorIndex,
    originalText: decodedOriginalPlan.originalText,
    replacementText,
    originalFontResourceName: operator.fontResourceName,
    originalEffectiveAdvancePt: decodedOriginalPlan.originalWidthPt,
    fontSizePt: operator.fontSizePt,
    charSpacing: operator.charSpacing,
    horizontalScalingPct: operator.horizontalScalingPct,
    sourcePlan: decodedOriginalPlan,
    sourceBinding: sourceBinding(sourceResourceIdentity),
    operatorSnapshot: snapshot,
    localFontAssetId: asset.descriptor.id,
    localFontSha256: asset.descriptor.sha256.toLowerCase(),
    localFontFamilyName: asset.descriptor.familyName,
    shapingProof: simpleShaping.proof,
  });
}

function encodePdfName(name: string): string {
  let out = "/";
  for (let index = 0; index < name.length; index += 1) {
    const code = name.charCodeAt(index);
    const char = name[index];
    const regular =
      code > 0x20 &&
      code < 0x7f &&
      char !== "#" &&
      !"()<>[]{}/%".includes(char);
    out += regular
      ? char
      : `#${code.toString(16).padStart(2, "0")}`;
  }
  return out;
}

function formatPdfNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded.toString();
}

function isFlateEncoded(stream: PDFRawStream): boolean {
  const filter = stream.dict.get(PDFName.of("Filter"));
  return (
    filter instanceof PDFName &&
    filter.asString() === "/FlateDecode"
  );
}

function copyStreamDict(
  source: PDFRawStream,
  target: PDFRawStream,
): void {
  for (const [key, value] of source.dict.entries()) {
    const name = key.asString();
    if (
      name === "/Length" ||
      name === "/Filter" ||
      name === "/DecodeParms"
    ) {
      continue;
    }
    target.dict.set(key, value);
  }
}

function nextLocalFontResourceName(fonts: PDFDict): string {
  let index = 0;
  let name = `${LOCAL_NATIVE_RESOURCE_PREFIX}${index}`;
  while (fonts.has(PDFName.of(name))) {
    index += 1;
    name = `${LOCAL_NATIVE_RESOURCE_PREFIX}${index}`;
  }
  return name;
}

function currentSourceMatchesPlan({
  plan,
  operator,
  currentSourcePlan,
  identity,
}: {
  plan: ValidatedLocalFontSubstitutionPlan;
  operator: TextShowOperator;
  currentSourcePlan: ValidatedEditPlan;
  identity: PdfFontResourceIdentity;
}): boolean {
  return (
    sourcePlanEqual(plan.sourcePlan, currentSourcePlan) &&
    operatorSnapshotEqual(plan.operatorSnapshot, operator) &&
    sourceBindingEqual(plan.sourceBinding, identity)
  );
}

function buildReplacementOperator({
  resourceName,
  originalResourceName,
  encodedHex,
  fontSizePt,
  tjAdjustment,
}: {
  resourceName: string;
  originalResourceName: string;
  encodedHex: string;
  fontSizePt: number;
  tjAdjustment: number;
}): string {
  const show =
    Math.abs(tjAdjustment) >= TJ_DELTA_EPSILON
      ? `[${encodedHex} ${formatPdfNumber(tjAdjustment)}] TJ`
      : `[${encodedHex}] TJ`;
  const size = formatPdfNumber(fontSizePt);
  return [
    `${encodePdfName(resourceName)} ${size} Tf`,
    show,
    `${encodePdfName(originalResourceName)} ${size} Tf`,
  ].join(" ");
}

export async function applyLocalFontSubstitutionToBytes({
  sourceBytes,
  plan,
  asset,
}: {
  sourceBytes: ArrayBuffer | Uint8Array;
  plan: LocalFontSubstitutionPlan;
  asset: LocalCustomFontAsset;
}): Promise<LocalFontSubstitutionWriteResult> {
  if (!isValidatedLocalFontSubstitutionPlan(plan)) {
    throw new Error(
      plan.reason ||
        "Only a planner-issued validated local-font substitution plan may reach the writer.",
    );
  }
  if (
    !assetIdentityIsCurrent(asset) ||
    asset.descriptor.id !== plan.localFontAssetId ||
    asset.descriptor.sha256.toLowerCase() !== plan.localFontSha256
  ) {
    throw new Error(
      "The local font asset no longer matches the font fingerprint validated for this native edit.",
    );
  }

  const doc = await PDFDocument.load(
    sourceBytes instanceof Uint8Array
      ? sourceBytes.slice()
      : sourceBytes.slice(0),
  );
  const registry = new PdfFontRegistry(doc);
  const located = collectPageTextOperators(doc, plan.pageIndex).find(
    (entry) =>
      entry.locator.kind === "page" &&
      entry.locator.contentStreamIndex === plan.contentStreamIndex &&
      entry.operatorIndex === plan.operatorIndex,
  );
  if (!located) {
    throw new Error(
      "The native text target changed after local-font validation. Reselect the text and try again.",
    );
  }
  const sourceResourceName = located.operator.fontResourceName;
  if (!sourceResourceName) {
    throw new Error(
      "The original PDF font resource disappeared after local-font validation.",
    );
  }
  const sourceProfile = registry.resolve(
    located.resources,
    sourceResourceName,
  );
  if (!sourceProfile) {
    throw new Error(
      "The original PDF font resource could not be re-resolved before the local-font write.",
    );
  }

  const currentSourcePlan = buildEditPlan({
    pageIndex: plan.pageIndex,
    contentStreamIndex: plan.contentStreamIndex,
    operatorIndex: plan.operatorIndex,
    operator: located.operator,
    replacementText: plan.originalText,
    resolvedFont: sourceProfile.resolvedFont,
    fontMetrics: sourceProfile.metrics,
    embeddedGlyphEvidence: sourceProfile.embeddedGlyphEvidence,
  });
  if (
    !isValidatedEditPlan(currentSourcePlan) ||
    !currentSourceMatchesPlan({
      plan,
      operator: located.operator,
      currentSourcePlan,
      identity: sourceProfile.resourceIdentity,
    })
  ) {
    throw new Error(
      "The native text or its font resource changed after local-font validation. Reselect the text and build a fresh plan.",
    );
  }

  const fontkitModule = await import("@pdf-lib/fontkit");
  const fontkit = fontkitModule.default ?? fontkitModule;
  doc.registerFontkit(
    fontkit as unknown as Parameters<PDFDocument["registerFontkit"]>[0],
  );
  const embedded = await doc.embedFont(asset.bytes.slice(), {
    subset: true,
  });
  const encoded = embedded.encodeText(plan.replacementText).toString();
  if (!/^<[0-9A-Fa-f]+>$/.test(encoded)) {
    throw new Error(
      "The embedded local font did not produce a deterministic PDF hex string.",
    );
  }

  const horizontalScale = plan.horizontalScalingPct / 100;
  if (horizontalScale <= 0 || plan.fontSizePt <= 0) {
    throw new Error(
      "The native PDF text state is not valid for local-font advance reconciliation.",
    );
  }
  const characterCount = Array.from(plan.replacementText).length;
  const replacementAdvancePt =
    (embedded.widthOfTextAtSize(
      plan.replacementText,
      plan.fontSizePt,
    ) +
      plan.charSpacing * characterCount) *
    horizontalScale;
  const tjAdjustment =
    ((replacementAdvancePt - plan.originalEffectiveAdvancePt) /
      (plan.fontSizePt * horizontalScale)) *
    1000;
  if (!Number.isFinite(tjAdjustment)) {
    throw new Error(
      "The local-font endpoint compensation could not be computed safely.",
    );
  }

  const fonts = resolveFallbackFontsDict(doc, plan.pageIndex, null);
  const resourceName = nextLocalFontResourceName(fonts);
  fonts.set(PDFName.of(resourceName), embedded.ref);

  const target = resolveStreamTarget(
    doc,
    plan.pageIndex,
    plan.contentStreamIndex,
    null,
  );
  const currentOperator = collectPageTextOperators(doc, plan.pageIndex).find(
    (entry) =>
      entry.locator.kind === "page" &&
      entry.locator.contentStreamIndex === plan.contentStreamIndex &&
      entry.operatorIndex === plan.operatorIndex,
  )?.operator;
  if (
    !currentOperator ||
    currentOperator.start < 0 ||
    currentOperator.end <= currentOperator.start ||
    currentOperator.end > target.decodedBytes.byteLength
  ) {
    throw new Error(
      "The native text byte range became stale before the local-font write.",
    );
  }

  const operatorText = buildReplacementOperator({
    resourceName,
    originalResourceName: plan.originalFontResourceName,
    encodedHex: encoded,
    fontSizePt: plan.fontSizePt,
    tjAdjustment,
  });
  const replacementBytes = new TextEncoder().encode(operatorText);
  const before = target.decodedBytes.subarray(0, currentOperator.start);
  const after = target.decodedBytes.subarray(currentOperator.end);
  const rewritten = new Uint8Array(
    before.byteLength + replacementBytes.byteLength + after.byteLength,
  );
  rewritten.set(before, 0);
  rewritten.set(replacementBytes, before.byteLength);
  rewritten.set(after, before.byteLength + replacementBytes.byteLength);

  const newStream = isFlateEncoded(target.originalStream)
    ? target.context.flateStream(rewritten)
    : target.context.stream(rewritten);
  copyStreamDict(target.originalStream, newStream);
  target.writeBack(target.context.register(newStream));

  const bytes = await doc.save();

  const reopened = await PDFDocument.load(bytes.slice());
  const reopenedRegistry = new PdfFontRegistry(reopened);
  const reopenedTarget = collectPageTextOperators(
    reopened,
    plan.pageIndex,
  ).find(
    (entry) =>
      entry.locator.kind === "page" &&
      entry.locator.contentStreamIndex === plan.contentStreamIndex &&
      entry.operatorIndex === plan.operatorIndex,
  );
  if (!reopenedTarget) {
    throw new Error(
      "The native local-font target could not be reopened after serialization.",
    );
  }
  if (reopenedTarget.operator.fontResourceName !== resourceName) {
    throw new Error(
      "The reopened native text is not bound to the embedded local font resource.",
    );
  }
  const reopenedProfile = reopenedRegistry.resolve(
    reopenedTarget.resources,
    resourceName,
  );
  if (
    !reopenedProfile ||
    !reopenedProfile.isEmbedded ||
    !reopenedProfile.resourceIdentity.fontProgramObjectRef ||
    !reopenedProfile.embeddedProgramSha256
  ) {
    throw new Error(
      "The reopened local font resource is missing its embedded font program.",
    );
  }

  const reopenedPlan = buildEditPlan({
    pageIndex: plan.pageIndex,
    contentStreamIndex: plan.contentStreamIndex,
    operatorIndex: plan.operatorIndex,
    operator: reopenedTarget.operator,
    replacementText: plan.replacementText,
    resolvedFont: reopenedProfile.resolvedFont,
    fontMetrics: reopenedProfile.metrics,
    embeddedGlyphEvidence: reopenedProfile.embeddedGlyphEvidence,
  });
  if (
    reopenedPlan.originalText !== plan.replacementText ||
    !reopenedPlan.originalText
  ) {
    throw new Error(
      "The reopened local-font text does not preserve the exact replacement Unicode mapping.",
    );
  }

  return {
    bytes,
    resourceName,
    embeddedProgramSha256:
      reopenedProfile.embeddedProgramSha256,
    verifiedText: reopenedPlan.originalText,
  };
}
