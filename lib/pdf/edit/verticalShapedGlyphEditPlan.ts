import type { Matrix2x3, TextShowOperator } from "./contentStream.ts";
import {
  buildEditPlan,
  isValidatedEditPlan,
} from "./editPlan.ts";
import type { ResolvedFont } from "./fontEncoding.ts";
import type { FontMetrics } from "./fontMetrics.ts";
import type {
  PdfFontResourceIdentity,
  PdfFontShapingInspection,
} from "./fontRegistry.ts";
import {
  SHAPING_POSITION_TOLERANCE_FONT_UNITS,
} from "./shapingReconciliation.ts";
import type { ShapedGlyphResourceBinding } from "./shapedGlyphAddressability.ts";
import {
  metricForVerticalCid,
  type PdfVerticalFontMetricsEvidence,
  type PdfVerticalGlyphMetric,
} from "./verticalFontMetrics.ts";
import type {
  VerticalShapedGlyphEvidence,
} from "./verticalShapedGlyphEvidence.ts";

const MAX_ABS_TJ_ADJUSTMENT = 1_000_000;
const MATRIX_TOLERANCE = 1e-9;

export type VerticalShapedGlyphEditGlyph = Readonly<{
  glyphIndex: number;
  glyphId: number;
  cid: number;
  pdfCode: number;
  clusterText: string;
  pdfDisplacementY1000: number;
  pdfPositionX1000: number;
  pdfPositionY1000: number;
  xAdvanceFontUnits: number;
  yAdvanceFontUnits: number;
  xOffsetFontUnits: number;
  yOffsetFontUnits: number;
  desiredAdvanceY1000: number;
  tjAdjustment: number;
}>;

export type VerticalOriginalGlyphMetric = Readonly<{
  cid: number;
  displacementY1000: number;
  positionX1000: number;
  positionY1000: number;
}>;

export type VerticalShapedGlyphEditPlanFields = Readonly<{
  pageIndex: number;
  contentStreamIndex: number;
  formPath: readonly string[] | null;
  operatorIndex: number;
  operatorType: "Tj" | "TJ";
  byteOffset: number;
  byteLength: number;
  fontResourceName: string;
  fontSizePt: number;
  charSpacing: number;
  wordSpacing: 0;
  horizontalScalingPct: number;
  leading: number;
  textRise: number;
  renderMode: number;
  textRenderingMatrix: Matrix2x3;
  originalText: string;
  replacementText: string;
  originalGlyphCodes: readonly number[];
  originalGlyphMetrics: readonly VerticalOriginalGlyphMetric[];
  originalTjAdjustmentTotal: number;
  originalEffectiveAdvancePt: number;
  shapedAdvancePt: number;
  endpointTjAdjustment: number;
  embeddedProgramSha256: string;
  shapingEngineVersion: string;
  unitsPerEm: number;
  resourceBinding: ShapedGlyphResourceBinding;
  glyphs: readonly VerticalShapedGlyphEditGlyph[];
}>;

class ValidatedVerticalShapedGlyphEditPlanProof {
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

export type ValidatedVerticalShapedGlyphEditPlan =
  VerticalShapedGlyphEditPlanFields &
  ValidatedVerticalShapedGlyphEditPlanProof &
  Readonly<{
    editable: true;
    reason: null;
  }>;

export type RejectedVerticalShapedGlyphEditPlan = Readonly<{
  editable: false;
  reason: string;
}>;

export type VerticalShapedGlyphEditPlan =
  | ValidatedVerticalShapedGlyphEditPlan
  | RejectedVerticalShapedGlyphEditPlan;

function rejected(reason: string): RejectedVerticalShapedGlyphEditPlan {
  return Object.freeze({ editable: false, reason });
}

function issueValidatedVerticalShapedGlyphEditPlan(
  fields: VerticalShapedGlyphEditPlanFields,
): ValidatedVerticalShapedGlyphEditPlan {
  const plan = Object.assign(
    new ValidatedVerticalShapedGlyphEditPlanProof(),
    fields,
    { editable: true as const, reason: null },
  ) as ValidatedVerticalShapedGlyphEditPlan;

  Object.freeze(plan.originalGlyphCodes);
  for (const metric of plan.originalGlyphMetrics) Object.freeze(metric);
  Object.freeze(plan.originalGlyphMetrics);
  if (plan.formPath) Object.freeze(plan.formPath);
  Object.freeze(plan.textRenderingMatrix);
  for (const glyph of plan.glyphs) Object.freeze(glyph);
  Object.freeze(plan.glyphs);
  Object.freeze(plan.resourceBinding);
  Object.freeze(plan);
  return plan;
}

export function isValidatedVerticalShapedGlyphEditPlan(
  plan: unknown,
): plan is ValidatedVerticalShapedGlyphEditPlan {
  return (
    plan instanceof ValidatedVerticalShapedGlyphEditPlanProof &&
    plan.isPlannerIssued() &&
    Object.isFrozen(plan)
  );
}

function sameResourceBinding(
  binding: ShapedGlyphResourceBinding,
  identity: PdfFontResourceIdentity,
): boolean {
  if (
    binding.fontObjectRef !== identity.fontObjectRef ||
    binding.descendantObjectRef !== identity.descendantObjectRef ||
    binding.fontProgramObjectRef !== identity.fontProgramObjectRef ||
    binding.toUnicodeObjectRef !== identity.toUnicodeObjectRef ||
    binding.encodingObjectRef !== identity.encodingObjectRef
  ) {
    return false;
  }

  if (binding.cidToGidMapKind === "identity") {
    return (
      identity.cidToGidMap?.kind === "name" &&
      identity.cidToGidMap.name === "Identity"
    );
  }

  return (
    identity.cidToGidMap?.kind === "stream" &&
    identity.cidToGidMap.objectRef === binding.cidToGidMapObjectRef
  );
}

function metricEquals(
  actual: PdfVerticalGlyphMetric,
  expected: Pick<
    PdfVerticalGlyphMetric,
    "displacementY" | "positionX" | "positionY"
  >,
): boolean {
  return (
    actual.displacementY === expected.displacementY &&
    actual.positionX === expected.positionX &&
    actual.positionY === expected.positionY
  );
}

function matrixIsFinite(matrix: readonly number[]): matrix is Matrix2x3 {
  return matrix.length === 6 && matrix.every(Number.isFinite);
}

function offsetMatchesPdfVerticalOrigin({
  offsetFontUnits,
  pdfPosition1000,
  unitsPerEm,
}: {
  offsetFontUnits: number;
  pdfPosition1000: number;
  unitsPerEm: number;
}): boolean {
  const expected = -(pdfPosition1000 / 1000) * unitsPerEm;
  return (
    Number.isFinite(offsetFontUnits) &&
    Number.isFinite(expected) &&
    Math.abs(offsetFontUnits - expected) <=
      SHAPING_POSITION_TOLERANCE_FONT_UNITS
  );
}

/**
 * Converts explicit top-to-bottom HarfBuzz + Identity-V resource evidence into
 * the first nominal vertical shaped-glyph native-write plan.
 *
 * This is deliberately separate from buildShapedGlyphEditPlan. Horizontal
 * scaling must never leak into vertical endpoint math, and PDF /W2 /DW2
 * position vectors remain canonical glyph placement.
 *
 * First-slice limits:
 * - Type0/CIDFontType2 Identity-V, two-byte codes;
 * - Tj/TJ only;
 * - visible, non-clipping text;
 * - zero word spacing;
 * - one addressed glyph per source cluster (already proven by evidence);
 * - HarfBuzz x advance ~= 0;
 * - HarfBuzz x/y offsets must equal the negative PDF vertical position vector;
 * - y advance may differ from nominal /W2 displacement only when bounded TJ
 *   positioning can express the difference;
 * - no font/resource mutation and no capability promotion.
 */
export function buildVerticalShapedGlyphEditPlan({
  pageIndex,
  contentStreamIndex,
  formPath = null,
  operatorIndex,
  operator,
  replacementText,
  resolvedFont,
  fontMetrics,
  verticalMetrics,
  resourceIdentity,
  embeddedProgramSha256,
  shapingInspection,
  verticalEvidence,
}: {
  pageIndex: number;
  contentStreamIndex: number;
  formPath?: string[] | null;
  operatorIndex: number;
  operator: TextShowOperator;
  replacementText: string;
  resolvedFont: ResolvedFont;
  fontMetrics: FontMetrics;
  verticalMetrics: PdfVerticalFontMetricsEvidence;
  resourceIdentity: PdfFontResourceIdentity;
  embeddedProgramSha256: string | null;
  shapingInspection: PdfFontShapingInspection;
  verticalEvidence: VerticalShapedGlyphEvidence;
}): VerticalShapedGlyphEditPlan {
  if (operator.kind !== "Tj" && operator.kind !== "TJ") {
    return rejected(
      "The first vertical shaped-glyph writer is limited to Tj/TJ text-show operators.",
    );
  }
  if (operator.renderMode === 3) {
    return rejected(
      "Invisible searchable text remains read-only to native vertical editing.",
    );
  }
  if (operator.renderMode >= 4) {
    return rejected(
      "Clipping text remains read-only because rewriting it could change the page clipping path.",
    );
  }
  if (!operator.fontResourceName) {
    return rejected(
      "The selected vertical text does not expose an exact PDF font resource name.",
    );
  }
  if (
    resolvedFont.kind !== "Type0" ||
    resolvedFont.bytesPerCode !== 2 ||
    fontMetrics.bytesPerCode !== 2
  ) {
    return rejected(
      "The first vertical shaped-glyph writer requires an existing two-byte Type0 font resource.",
    );
  }
  if (
    resourceIdentity.type0Encoding !== "Identity-V" ||
    resourceIdentity.writingMode !== "vertical" ||
    resourceIdentity.descendantSubtype !== "CIDFontType2"
  ) {
    return rejected(
      "Vertical shaped-glyph writing requires a proven Identity-V CIDFontType2 resource.",
    );
  }
  if (operator.wordSpacing !== 0) {
    return rejected(
      "The first vertical writer requires zero PDF word spacing so composite-font spacing semantics cannot be guessed.",
    );
  }
  if (
    !Number.isFinite(operator.fontSizePt) ||
    operator.fontSizePt <= 0 ||
    !Number.isFinite(operator.charSpacing) ||
    !Number.isFinite(operator.horizontalScalingPct) ||
    operator.horizontalScalingPct <= 0 ||
    !Number.isFinite(operator.leading) ||
    !Number.isFinite(operator.textRise) ||
    !matrixIsFinite(operator.textRenderingMatrix)
  ) {
    return rejected(
      "The current vertical PDF text state contains non-finite or unusable values.",
    );
  }

  const structural = buildEditPlan({
    pageIndex,
    contentStreamIndex,
    formPath,
    operatorIndex,
    operator,
    replacementText: "",
    resolvedFont,
    fontMetrics,
  });
  if (!isValidatedEditPlan(structural)) {
    return rejected(structural.reason);
  }
  if (structural.fallbackFont || structural.replacementTextState) {
    return rejected(
      "Vertical shaped-glyph writing cannot switch fonts or text state in this first slice.",
    );
  }

  if (shapingInspection.kind !== "reconciled") {
    return rejected(shapingInspection.reason);
  }
  const { shaped, reconciliation } = shapingInspection;
  if (shaped.text !== replacementText) {
    return rejected(
      "HarfBuzz vertical evidence belongs to different replacement text.",
    );
  }
  if (
    !shaped.directionWasExplicit ||
    shaped.requestedDirection !== "ttb"
  ) {
    return rejected(
      "The first vertical shaped-glyph writer requires explicit top-to-bottom HarfBuzz shaping.",
    );
  }
  if (reconciliation.kind !== "requires-shaped-glyph-write") {
    return rejected(
      "This replacement does not require a shaped-glyph writer.",
    );
  }
  if (
    !Number.isFinite(shaped.unitsPerEm) ||
    shaped.unitsPerEm <= 0
  ) {
    return rejected("HarfBuzz returned an invalid units-per-em value.");
  }

  if (verticalEvidence.kind !== "resolved") {
    return rejected(verticalEvidence.reason);
  }
  if (verticalMetrics.kind !== "resolved") {
    return rejected(verticalMetrics.reason);
  }
  if (
    !embeddedProgramSha256 ||
    !/^[a-f0-9]{64}$/i.test(embeddedProgramSha256) ||
    verticalEvidence.embeddedProgramSha256 !==
      embeddedProgramSha256.toLowerCase()
  ) {
    return rejected(
      "The vertical shaped-glyph evidence is not bound to this exact embedded font fingerprint.",
    );
  }
  if (
    verticalEvidence.binding.resourceName !== operator.fontResourceName ||
    !sameResourceBinding(verticalEvidence.binding, resourceIdentity)
  ) {
    return rejected(
      "The vertical shaped-glyph evidence belongs to a different PDF font resource.",
    );
  }
  if (
    verticalEvidence.addresses.length !== shaped.glyphs.length ||
    shaped.glyphs.length === 0
  ) {
    return rejected(
      "Vertical shaped glyphs and PDF evidence do not cover the same non-empty glyph sequence.",
    );
  }

  const originalGlyphMetrics: VerticalOriginalGlyphMetric[] = [];
  let originalAdvancePt = 0;
  for (const cid of structural.originalGlyphCodes) {
    const metric = metricForVerticalCid({
      cid,
      vertical: verticalMetrics,
      horizontal: fontMetrics,
    });
    if (!metric) {
      return rejected(
        `Complete vertical metrics are unavailable for original CID ${cid}.`,
      );
    }
    originalGlyphMetrics.push({
      cid,
      displacementY1000: metric.displacementY,
      positionX1000: metric.positionX,
      positionY1000: metric.positionY,
    });
    originalAdvancePt +=
      (metric.displacementY / 1000) * operator.fontSizePt +
      operator.charSpacing;
  }

  const originalTjAdjustmentTotal =
    structural.originalTjAdjustmentTotal ?? 0;
  originalAdvancePt -=
    (originalTjAdjustmentTotal / 1000) * operator.fontSizePt;

  if (!Number.isFinite(originalAdvancePt) || originalAdvancePt >= 0) {
    return rejected(
      "The original vertical text endpoint is not a finite top-to-bottom advance.",
    );
  }

  const glyphs: VerticalShapedGlyphEditGlyph[] = [];
  let shapedAdvancePt = 0;

  for (let index = 0; index < shaped.glyphs.length; index += 1) {
    const shapedGlyph = shaped.glyphs[index];
    const address = verticalEvidence.addresses[index];
    if (
      !address ||
      address.glyphIndex !== index ||
      address.glyphId !== shapedGlyph.glyphId ||
      resolvedFont.glyphCodeToUnicode.get(address.pdfCode) !==
        address.clusterText
    ) {
      return rejected(
        "A vertical shaped glyph no longer matches its exact PDF CID/ToUnicode address.",
      );
    }

    const currentMetric = metricForVerticalCid({
      cid: address.pdfCode,
      vertical: verticalMetrics,
      horizontal: fontMetrics,
    });
    if (
      !currentMetric ||
      !metricEquals(currentMetric, address.verticalMetric)
    ) {
      return rejected(
        "PDF vertical metric evidence changed after the glyph address was proven.",
      );
    }

    if (
      !Number.isFinite(shapedGlyph.xAdvance) ||
      Math.abs(shapedGlyph.xAdvance) >
        SHAPING_POSITION_TOLERANCE_FONT_UNITS ||
      !Number.isFinite(shapedGlyph.yAdvance) ||
      shapedGlyph.yAdvance >= 0 ||
      !offsetMatchesPdfVerticalOrigin({
        offsetFontUnits: shapedGlyph.xOffset,
        pdfPosition1000: currentMetric.positionX,
        unitsPerEm: shaped.unitsPerEm,
      }) ||
      !offsetMatchesPdfVerticalOrigin({
        offsetFontUnits: shapedGlyph.yOffset,
        pdfPosition1000: currentMetric.positionY,
        unitsPerEm: shaped.unitsPerEm,
      })
    ) {
      return rejected(
        "HarfBuzz vertical placement does not reconcile exactly with the PDF /W2 /DW2 position vector.",
      );
    }

    const desiredAdvanceY1000 =
      (shapedGlyph.yAdvance / shaped.unitsPerEm) * 1000;
    const intrinsicTjAdjustment =
      currentMetric.displacementY - desiredAdvanceY1000;
    if (
      !Number.isFinite(desiredAdvanceY1000) ||
      desiredAdvanceY1000 >= 0 ||
      !Number.isFinite(intrinsicTjAdjustment) ||
      Math.abs(intrinsicTjAdjustment) > MAX_ABS_TJ_ADJUSTMENT
    ) {
      return rejected(
        "A vertical shaped glyph advance cannot be represented safely by bounded PDF TJ positioning.",
      );
    }

    shapedAdvancePt +=
      (desiredAdvanceY1000 / 1000) * operator.fontSizePt +
      operator.charSpacing;
    if (!Number.isFinite(shapedAdvancePt)) {
      return rejected(
        "The vertical shaped replacement advance overflowed during validation.",
      );
    }

    glyphs.push({
      glyphIndex: index,
      glyphId: shapedGlyph.glyphId,
      cid: address.cid,
      pdfCode: address.pdfCode,
      clusterText: address.clusterText,
      pdfDisplacementY1000: currentMetric.displacementY,
      pdfPositionX1000: currentMetric.positionX,
      pdfPositionY1000: currentMetric.positionY,
      xAdvanceFontUnits: shapedGlyph.xAdvance,
      yAdvanceFontUnits: shapedGlyph.yAdvance,
      xOffsetFontUnits: shapedGlyph.xOffset,
      yOffsetFontUnits: shapedGlyph.yOffset,
      desiredAdvanceY1000,
      tjAdjustment: intrinsicTjAdjustment,
    });
  }

  if (!Number.isFinite(shapedAdvancePt) || shapedAdvancePt >= 0) {
    return rejected(
      "The vertical shaped replacement is not a finite top-to-bottom advance.",
    );
  }

  const endpointTjAdjustment =
    ((shapedAdvancePt - originalAdvancePt) / operator.fontSizePt) *
    1000;
  if (
    !Number.isFinite(endpointTjAdjustment) ||
    Math.abs(endpointTjAdjustment) > MAX_ABS_TJ_ADJUSTMENT
  ) {
    return rejected(
      "The vertical shaped replacement would require unsafe endpoint compensation.",
    );
  }

  const last = glyphs[glyphs.length - 1];
  const finalLastAdjustment =
    last.tjAdjustment + endpointTjAdjustment;
  if (
    !Number.isFinite(finalLastAdjustment) ||
    Math.abs(finalLastAdjustment) > MAX_ABS_TJ_ADJUSTMENT
  ) {
    return rejected(
      "The final vertical shaped-glyph TJ adjustment exceeds the bounded writer limit.",
    );
  }
  glyphs[glyphs.length - 1] = {
    ...last,
    tjAdjustment: finalLastAdjustment,
  };

  return issueValidatedVerticalShapedGlyphEditPlan({
    pageIndex,
    contentStreamIndex,
    formPath: formPath ? [...formPath] : null,
    operatorIndex,
    operatorType: operator.kind,
    byteOffset: structural.byteOffset,
    byteLength: structural.byteLength,
    fontResourceName: operator.fontResourceName,
    fontSizePt: operator.fontSizePt,
    charSpacing: operator.charSpacing,
    wordSpacing: 0,
    horizontalScalingPct: operator.horizontalScalingPct,
    leading: operator.leading,
    textRise: operator.textRise,
    renderMode: operator.renderMode,
    textRenderingMatrix: [...operator.textRenderingMatrix] as Matrix2x3,
    originalText: structural.originalText,
    replacementText,
    originalGlyphCodes: [...structural.originalGlyphCodes],
    originalGlyphMetrics,
    originalTjAdjustmentTotal,
    originalEffectiveAdvancePt: originalAdvancePt,
    shapedAdvancePt,
    endpointTjAdjustment,
    embeddedProgramSha256: embeddedProgramSha256.toLowerCase(),
    shapingEngineVersion: shaped.engineVersion,
    unitsPerEm: shaped.unitsPerEm,
    resourceBinding: verticalEvidence.binding,
    glyphs,
  });
}
