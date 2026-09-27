import type { TextShowOperator } from "./contentStream.ts";
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
import type {
  ShapedGlyphAddressabilityResult,
  ShapedGlyphResourceBinding,
} from "./shapedGlyphAddressability.ts";

const MAX_ABS_TJ_ADJUSTMENT = 1_000_000;

export type ShapedGlyphEditGlyph = Readonly<{
  glyphIndex: number;
  glyphId: number;
  cid: number;
  pdfCode: number;
  clusterText: string;
  width1000: number;
  xAdvanceFontUnits: number;
  desiredAdvance1000: number;
  tjAdjustment: number;
}>;

export type ShapedGlyphEditPlanFields = Readonly<{
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
  wordSpacing: number;
  horizontalScalingPct: number;
  renderMode: number;
  originalText: string;
  replacementText: string;
  originalGlyphCodes: readonly number[];
  originalTjAdjustmentTotal: number;
  originalEffectiveAdvancePt: number;
  shapedAdvancePt: number;
  endpointTjAdjustment: number;
  embeddedProgramSha256: string;
  shapingEngineVersion: string;
  resourceBinding: ShapedGlyphResourceBinding;
  glyphs: readonly ShapedGlyphEditGlyph[];
}>;

class ValidatedShapedGlyphEditPlanProof {
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

export type ValidatedShapedGlyphEditPlan =
  ShapedGlyphEditPlanFields &
  ValidatedShapedGlyphEditPlanProof &
  Readonly<{
    editable: true;
    reason: null;
  }>;

export type RejectedShapedGlyphEditPlan = Readonly<{
  editable: false;
  reason: string;
}>;

export type ShapedGlyphEditPlan =
  | ValidatedShapedGlyphEditPlan
  | RejectedShapedGlyphEditPlan;

function rejected(reason: string): RejectedShapedGlyphEditPlan {
  return Object.freeze({ editable: false, reason });
}

function issueValidatedShapedGlyphEditPlan(
  fields: ShapedGlyphEditPlanFields,
): ValidatedShapedGlyphEditPlan {
  const plan = Object.assign(
    new ValidatedShapedGlyphEditPlanProof(),
    fields,
    { editable: true as const, reason: null },
  ) as ValidatedShapedGlyphEditPlan;

  Object.freeze(plan.originalGlyphCodes);
  if (plan.formPath) Object.freeze(plan.formPath);
  for (const glyph of plan.glyphs) Object.freeze(glyph);
  Object.freeze(plan.glyphs);
  Object.freeze(plan.resourceBinding);
  Object.freeze(plan);
  return plan;
}

export function isValidatedShapedGlyphEditPlan(
  plan: unknown,
): plan is ValidatedShapedGlyphEditPlan {
  return (
    plan instanceof ValidatedShapedGlyphEditPlanProof &&
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

function finiteWithin(value: number, tolerance: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= tolerance;
}

/**
 * Converts advisory HarfBuzz + PDF resource evidence into the first nominal
 * shaped-glyph native-write plan.
 *
 * This planner deliberately does NOT support RTL, vertical writing, glyph
 * offsets, one-to-many clusters, quote operators or resource mutation. It
 * reuses buildEditPlan with an empty replacement solely to inherit the proven
 * structural/original-text/render-mode/width/endpoint authority, then replaces
 * the ordinary character-code replacement side with independently addressed
 * shaped CIDs.
 */
export function buildShapedGlyphEditPlan({
  pageIndex,
  contentStreamIndex,
  formPath = null,
  operatorIndex,
  operator,
  replacementText,
  resolvedFont,
  fontMetrics,
  resourceIdentity,
  embeddedProgramSha256,
  shapingInspection,
  addressability,
}: {
  pageIndex: number;
  contentStreamIndex: number;
  formPath?: string[] | null;
  operatorIndex: number;
  operator: TextShowOperator;
  replacementText: string;
  resolvedFont: ResolvedFont;
  fontMetrics: FontMetrics;
  resourceIdentity: PdfFontResourceIdentity;
  embeddedProgramSha256: string | null;
  shapingInspection: PdfFontShapingInspection;
  addressability: ShapedGlyphAddressabilityResult;
}): ShapedGlyphEditPlan {
  if (operator.kind !== "Tj" && operator.kind !== "TJ") {
    return rejected(
      "The first shaped-glyph writer is limited to Tj/TJ text-show operators.",
    );
  }
  if (operator.renderMode === 3) {
    return rejected(
      "Invisible searchable text remains read-only to native shaped-glyph editing.",
    );
  }
  if (!operator.fontResourceName) {
    return rejected(
      "The selected text does not expose an exact PDF font resource name.",
    );
  }
  if (
    resolvedFont.kind !== "Type0" ||
    resolvedFont.bytesPerCode !== 2 ||
    fontMetrics.bytesPerCode !== 2
  ) {
    return rejected(
      "The first shaped-glyph writer requires an existing two-byte Type0 font resource.",
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
      "Shaped-glyph writing cannot switch fonts or text state in this first slice.",
    );
  }

  if (shapingInspection.kind !== "reconciled") {
    return rejected(shapingInspection.reason);
  }
  const { shaped, reconciliation } = shapingInspection;
  if (shaped.text !== replacementText) {
    return rejected(
      "HarfBuzz evidence belongs to different replacement text.",
    );
  }
  if (
    !shaped.directionWasExplicit ||
    shaped.requestedDirection !== "ltr"
  ) {
    return rejected(
      "The first shaped-glyph writer is limited to explicit left-to-right shaping.",
    );
  }
  if (reconciliation.kind !== "requires-shaped-glyph-write") {
    return rejected(
      "This replacement does not require the shaped-glyph writer; use the existing character-code writer instead.",
    );
  }
  if (
    !reconciliation.requiresGlyphSubstitution &&
    !reconciliation.requiresPerGlyphPositioning
  ) {
    return rejected(
      "HarfBuzz did not prove a glyph substitution or per-glyph positioning requirement.",
    );
  }
  if (
    !Number.isFinite(shaped.unitsPerEm) ||
    shaped.unitsPerEm <= 0
  ) {
    return rejected("HarfBuzz returned an invalid units-per-em value.");
  }

  if (addressability.kind !== "addressable") {
    return rejected(addressability.reason);
  }
  if (
    !embeddedProgramSha256 ||
    !/^[a-f0-9]{64}$/i.test(embeddedProgramSha256) ||
    addressability.embeddedProgramSha256 !==
      embeddedProgramSha256.toLowerCase()
  ) {
    return rejected(
      "The shaped-glyph addressability proof is not bound to this exact embedded font fingerprint.",
    );
  }
  if (
    addressability.binding.resourceName !== operator.fontResourceName ||
    !sameResourceBinding(addressability.binding, resourceIdentity)
  ) {
    return rejected(
      "The shaped-glyph addressability proof belongs to a different PDF font resource.",
    );
  }
  if (
    addressability.addresses.length !== shaped.glyphs.length ||
    shaped.glyphs.length === 0
  ) {
    return rejected(
      "Shaped glyphs and PDF-addressability evidence do not cover the same non-empty glyph sequence.",
    );
  }

  const fontScalePt =
    operator.fontSizePt * (operator.horizontalScalingPct / 100);
  if (
    !Number.isFinite(operator.fontSizePt) ||
    operator.fontSizePt <= 0 ||
    !Number.isFinite(operator.horizontalScalingPct) ||
    operator.horizontalScalingPct <= 0 ||
    !Number.isFinite(fontScalePt) ||
    fontScalePt <= 0
  ) {
    return rejected(
      "The current PDF font size/horizontal scale cannot safely express shaped glyph positioning.",
    );
  }

  const glyphs: ShapedGlyphEditGlyph[] = [];
  let shapedAdvancePt = 0;

  for (let index = 0; index < shaped.glyphs.length; index += 1) {
    const shapedGlyph = shaped.glyphs[index];
    const address = addressability.addresses[index];
    if (
      !address ||
      address.glyphIndex !== index ||
      address.glyphId !== shapedGlyph.glyphId ||
      resolvedFont.glyphCodeToUnicode.get(address.pdfCode) !==
        address.clusterText
    ) {
      return rejected(
        "A shaped glyph no longer matches its exact PDF CID/ToUnicode address.",
      );
    }

    const currentWidth =
      fontMetrics.glyphWidths.get(address.pdfCode) ??
      fontMetrics.defaultWidth;
    if (
      !Number.isFinite(currentWidth) ||
      currentWidth <= 0 ||
      Math.abs(currentWidth - address.width1000) > 1e-9
    ) {
      return rejected(
        "PDF width evidence changed after shaped-glyph addressability was proven.",
      );
    }

    if (
      !Number.isFinite(shapedGlyph.xAdvance) ||
      shapedGlyph.xAdvance <= 0 ||
      !finiteWithin(
        shapedGlyph.yAdvance,
        SHAPING_POSITION_TOLERANCE_FONT_UNITS,
      ) ||
      !finiteWithin(
        shapedGlyph.xOffset,
        SHAPING_POSITION_TOLERANCE_FONT_UNITS,
      ) ||
      !finiteWithin(
        shapedGlyph.yOffset,
        SHAPING_POSITION_TOLERANCE_FONT_UNITS,
      )
    ) {
      return rejected(
        "This shaped run needs glyph offsets, vertical advance, or a non-positive advance that the first native shaped writer does not emit.",
      );
    }

    const desiredAdvance1000 =
      (shapedGlyph.xAdvance / shaped.unitsPerEm) * 1000;
    const intrinsicTjAdjustment =
      address.width1000 - desiredAdvance1000;
    if (
      !Number.isFinite(desiredAdvance1000) ||
      desiredAdvance1000 <= 0 ||
      !Number.isFinite(intrinsicTjAdjustment) ||
      Math.abs(intrinsicTjAdjustment) > MAX_ABS_TJ_ADJUSTMENT
    ) {
      return rejected(
        "A shaped glyph advance cannot be represented safely by bounded PDF TJ positioning.",
      );
    }

    shapedAdvancePt +=
      ((desiredAdvance1000 / 1000) * operator.fontSizePt +
        operator.charSpacing) *
      (operator.horizontalScalingPct / 100);
    if (!Number.isFinite(shapedAdvancePt)) {
      return rejected(
        "The shaped replacement advance overflowed during PDF text-space validation.",
      );
    }

    glyphs.push({
      glyphIndex: index,
      glyphId: shapedGlyph.glyphId,
      cid: address.cid,
      pdfCode: address.pdfCode,
      clusterText: address.clusterText,
      width1000: address.width1000,
      xAdvanceFontUnits: shapedGlyph.xAdvance,
      desiredAdvance1000,
      tjAdjustment: intrinsicTjAdjustment,
    });
  }

  if (
    !Number.isFinite(structural.originalWidthPt) ||
    structural.originalWidthPt < 0 ||
    !Number.isFinite(shapedAdvancePt) ||
    shapedAdvancePt <= 0
  ) {
    return rejected(
      "Original or shaped text advance is not finite and positive enough for endpoint preservation.",
    );
  }

  const endpointTjAdjustment =
    ((shapedAdvancePt - structural.originalWidthPt) / fontScalePt) *
    1000;
  if (
    !Number.isFinite(endpointTjAdjustment) ||
    Math.abs(endpointTjAdjustment) > MAX_ABS_TJ_ADJUSTMENT
  ) {
    return rejected(
      "The shaped replacement would require an unsafe endpoint compensation.",
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
      "The final shaped-glyph TJ adjustment exceeds the bounded writer limit.",
    );
  }
  glyphs[glyphs.length - 1] = {
    ...last,
    tjAdjustment: finalLastAdjustment,
  };

  return issueValidatedShapedGlyphEditPlan({
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
    wordSpacing: operator.wordSpacing,
    horizontalScalingPct: operator.horizontalScalingPct,
    renderMode: operator.renderMode,
    originalText: structural.originalText,
    replacementText,
    originalGlyphCodes: [...structural.originalGlyphCodes],
    originalTjAdjustmentTotal:
      structural.originalTjAdjustmentTotal ?? 0,
    originalEffectiveAdvancePt: structural.originalWidthPt,
    shapedAdvancePt,
    endpointTjAdjustment,
    embeddedProgramSha256:
      addressability.embeddedProgramSha256,
    shapingEngineVersion: shaped.engineVersion,
    resourceBinding: addressability.binding,
    glyphs,
  });
}
