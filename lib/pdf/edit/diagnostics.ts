import type {
  PdfCidSystemInfo,
  PdfCidToGidMapIdentity,
  PdfFontProfile,
  PdfFontWritingMode,
} from "./fontRegistry.ts";
import { stringAdvancePt } from "./fontMetrics.ts";
import type { PdfPageTextModel, PdfTextSourceMatch } from "./documentModel.ts";
import type { DetectedTextRun } from "./textRuns.ts";
import type { NativeContentStreamSpan } from "./nativeTextDetection.ts";
import type { TextSignalReconciliation } from "./textReconciliation.ts";
import type { PageTextCapabilityClassification } from "./textCapabilityClassifier.ts";

export const EDIT_PDF_DIAGNOSTIC_SCHEMA_VERSION = 3 as const;

export type EditPdfDiagnosticReason =
  | "bt-et-scope-not-tracked"
  | "stream-object-ref-not-exposed"
  | "font-object-ref-not-exposed"
  | "font-descriptor-ref-not-exposed"
  | "font-program-ref-not-exposed"
  | "encoding-differences-not-exposed"
  | "cmap-details-not-exposed"
  | "cid-system-info-not-exposed"
  | "cid-to-gid-map-not-exposed"
  | "glyph-ids-not-resolved"
  | "pdfjs-raw-transform-not-retained"
  | "native-pdfjs-baseline-not-reconciled"
  | "font-profile-unresolved"
  | "native-operator-unmatched";

export type EditPdfSpanDiagnostic = {
  spanId: string;
  pageNumber: number;
  source: {
    contentStream: {
      kind: "page" | "xobject" | null;
      contentStreamIndex: number | null;
      formPath: readonly string[] | null;
      objectRef: string | null;
    };
    operator: {
      kind: string | null;
      operatorIndex: number | null;
      btEtScope: number | null;
      rawEncodedHex: readonly string[];
      decodedUnicode: string | null;
      decodedUnicodeComplete: boolean;
    };
  };
  pdfJs: {
    unicode: string;
    fontName: string;
    rawTransform: readonly number[] | null;
    direction: string | null;
    hasEOL: boolean | null;
    widthPt: number;
    heightPt: number;
    boundsPt: { xPt: number; yPt: number; widthPt: number; heightPt: number };
  };
  font: {
    resourceName: string | null;
    baseFont: string | null;
    normalizedFamily: string | null;
    subsetPrefix: string | null;
    subtype: string | null;
    objectRef: string | null;
    descriptorRef: string | null;
    descendantRef: string | null;
    fontProgramRef: string | null;
    toUnicodeRef: string | null;
    encodingRef: string | null;
    descriptorFontName: string | null;
    descendantSubtype: string | null;
    descendantBaseFont: string | null;
    embedded: boolean | null;
    embeddedProgramByteLength: number | null;
    embeddedProgramSha256: string | null;
    embeddedCmapFormats: readonly number[];
    embeddedGlyphCount: number | null;
    embeddedUnicodeSubtableCount: number;
    embeddedGlyphEvidenceSafeForSimplePdfEncoding: boolean;
    encodingType: string | null;
    encodingDifferences: readonly unknown[] | null;
    toUnicodeAvailable: boolean | null;
    cmap: string | null;
    writingMode: PdfFontWritingMode | null;
    cidSystemInfo: PdfCidSystemInfo | null;
    cidToGidMap: PdfCidToGidMapIdentity | null;
    glyphIds: readonly number[] | null;
    browserPreviewCapability: boolean | null;
    nativeRewriteCapability: "proven" | "limited" | "blocked";
  };
  geometry: {
    fontSizePt: number;
    sourceTextRenderingMatrix: readonly number[] | null;
    textMatrix: readonly number[] | null;
    textLineMatrix: readonly number[] | null;
    ctm: readonly number[] | null;
    baselinePt: number;
    rotationDeg: number;
    skewDeg: number | null;
    horizontalScalingPct: number;
    characterSpacingPt: number;
    wordSpacingPt: number;
    textRisePt: number;
    renderMode: number;
    nativeGlyphAdvanceExcludingTjAdjustmentsPt: number | null;
    pdfJsWidthPt: number;
    widthDeltaPt: number | null;
    fontSizeDeltaPt: number | null;
    baselineDeltaPt: number | null;
  };
  paint: {
    fillColor: unknown;
    strokeColor: unknown;
    fillOpacity: number | null;
    strokeOpacity: number | null;
  };
  capability: {
    level: string;
    reason: string | null;
  };
  unresolvedEvidence: readonly EditPdfDiagnosticReason[];
};

export type EditPdfPageDiagnosticReport = {
  schemaVersion: typeof EDIT_PDF_DIAGNOSTIC_SCHEMA_VERSION;
  generatedAtIso: string | null;
  pageNumber: number;
  page: {
    widthPt: number;
    heightPt: number;
    capability: string;
    spanCount: number;
    editableSpanCount: number;
    viewOnlySpanCount: number;
    unsupportedSpanCount: number;
  };
  signals: {
    nativeSpanCount: number;
    pdfJsRunCount: number;
    classification: PageTextCapabilityClassification | null;
    reconciliations: readonly TextSignalReconciliation[];
  };
  spans: readonly EditPdfSpanDiagnostic[];
};

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function glyphCodes(strings: readonly Uint8Array[], bytesPerCode: 1 | 2): number[] | null {
  const codes: number[] = [];
  for (const bytes of strings) {
    if (bytesPerCode === 2 && bytes.length % 2 !== 0) return null;
    for (let i = 0; i < bytes.length; i += bytesPerCode) {
      codes.push(bytesPerCode === 1 ? bytes[i] : ((bytes[i] << 8) | bytes[i + 1]));
    }
  }
  return codes;
}

function decodeNativeText(
  match: PdfTextSourceMatch,
  profile: PdfFontProfile | null,
): { value: string | null; complete: boolean; codes: number[] | null } {
  if (!match || !profile) return { value: null, complete: false, codes: null };
  const codes = glyphCodes(match.operator.strings, profile.resolvedFont.bytesPerCode);
  if (!codes) return { value: null, complete: false, codes: null };
  let value = "";
  for (const code of codes) {
    const unicode = profile.resolvedFont.glyphCodeToUnicode.get(code);
    if (unicode === undefined) return { value: value || null, complete: false, codes };
    value += unicode;
  }
  return { value, complete: true, codes };
}

function subsetPrefix(baseFont: string | null): string | null {
  if (!baseFont) return null;
  const match = /^([A-Z]{6})\+/.exec(baseFont);
  return match?.[1] ?? null;
}

function rewriteCapability(level: string): "proven" | "limited" | "blocked" {
  if (level === "native-editable" || level === "fragmented-editable") return "proven";
  if (level === "view-only") return "limited";
  return "blocked";
}

function skewDeg(matrix: readonly number[] | null): number | null {
  if (!matrix || matrix.length < 4) return null;
  const xAxis = Math.atan2(matrix[1], matrix[0]);
  const yAxis = Math.atan2(-matrix[2], matrix[3]);
  const skew = ((yAxis - xAxis) * 180) / Math.PI;
  return Number.isFinite(skew) ? skew : null;
}

export function buildEditPdfPageDiagnosticReport({
  pageModel,
  runs,
  matches,
  fontProfiles,
  nativeSpans = [],
  reconciliations = [],
  pageClassification = null,
  pdfJsRunCount = runs.filter((run) => run.detectionSource !== "native").length,
  generatedAtIso = null,
}: {
  pageModel: PdfPageTextModel;
  runs: readonly DetectedTextRun[];
  matches: readonly PdfTextSourceMatch[];
  fontProfiles: readonly (PdfFontProfile | null)[];
  nativeSpans?: readonly NativeContentStreamSpan[];
  reconciliations?: readonly TextSignalReconciliation[];
  pageClassification?: PageTextCapabilityClassification | null;
  pdfJsRunCount?: number;
  generatedAtIso?: string | null;
}): EditPdfPageDiagnosticReport {
  const spans = pageModel.spans.map((span, index): EditPdfSpanDiagnostic => {
    const run = runs[index];
    const match = matches[index] ?? null;
    const profile = fontProfiles[index] ?? null;
    const decoded = decodeNativeText(match, profile);
    const unresolved = new Set<EditPdfDiagnosticReason>();

    if (!match) unresolved.add("native-operator-unmatched");
    if (match?.operator.textObjectIndex === undefined) unresolved.add("bt-et-scope-not-tracked");
    unresolved.add("stream-object-ref-not-exposed");
    unresolved.add("encoding-differences-not-exposed");

    const embeddedGlyphIds =
      profile?.kind === "TrueType" &&
      profile.embeddedGlyphEvidence?.safeForSimplePdfEncoding &&
      profile.embeddedGlyphCoverage &&
      decoded.value
        ? Array.from(decoded.value, (char) => {
            const codePoint = char.codePointAt(0);
            return codePoint === undefined
              ? null
              : profile.embeddedGlyphCoverage?.glyphIdForCodePoint(codePoint) ?? null;
          })
        : null;
    const provenEmbeddedGlyphIds =
      embeddedGlyphIds && embeddedGlyphIds.every((glyphId) => glyphId !== null)
        ? (embeddedGlyphIds as number[])
        : null;
    if (!provenEmbeddedGlyphIds) unresolved.add("glyph-ids-not-resolved");

    if (!profile) {
      unresolved.add("font-object-ref-not-exposed");
      unresolved.add("font-descriptor-ref-not-exposed");
      unresolved.add("font-program-ref-not-exposed");
      unresolved.add("cmap-details-not-exposed");
      unresolved.add("cid-system-info-not-exposed");
      unresolved.add("cid-to-gid-map-not-exposed");
    } else if (profile.kind === "Type0") {
      if (!profile.resourceIdentity.type0Encoding) unresolved.add("cmap-details-not-exposed");
      if (!profile.resourceIdentity.cidSystemInfo) unresolved.add("cid-system-info-not-exposed");
      if (!profile.resourceIdentity.cidToGidMap) unresolved.add("cid-to-gid-map-not-exposed");
    }
    if (!run?.pdfJsTransform) unresolved.add("pdfjs-raw-transform-not-retained");
    const reconciliation = reconciliations[index] ?? null;
    if (reconciliation?.confidence !== "high") {
      unresolved.add("native-pdfjs-baseline-not-reconciled");
    }
    if (!profile) unresolved.add("font-profile-unresolved");

    let nativeAdvance: number | null = null;
    if (match && profile && decoded.codes) {
      nativeAdvance = stringAdvancePt(decoded.codes, profile.metrics, {
        fontSizePt: match.operator.fontSizePt,
        charSpacing: match.operator.charSpacing,
        wordSpacing: match.operator.wordSpacing,
        horizontalScalingPct: match.operator.horizontalScalingPct,
      });
    }

    const pdfJsWidthPt = span.boundsPt.widthPt;
    return {
      spanId: span.id,
      pageNumber: span.pageIndex + 1,
      source: {
        contentStream: {
          kind: match?.locatedOperator.locator.kind ?? null,
          contentStreamIndex:
            match?.locatedOperator.locator.kind === "page"
              ? match.locatedOperator.locator.contentStreamIndex
              : null,
          formPath:
            match?.locatedOperator.locator.kind === "xobject"
              ? [...match.locatedOperator.locator.formPath]
              : null,
          objectRef: null,
        },
        operator: {
          kind: match?.operator.kind ?? null,
          operatorIndex: match?.locatedOperator.operatorIndex ?? null,
          btEtScope: match?.operator.textObjectIndex ?? null,
          rawEncodedHex: match?.operator.strings.map(hex) ?? [],
          decodedUnicode: decoded.value,
          decodedUnicodeComplete: decoded.complete,
        },
      },
      pdfJs: {
        unicode: run?.str ?? span.text,
        fontName: run?.fontName ?? span.style.fontFamily,
        rawTransform: run?.pdfJsTransform ? [...run.pdfJsTransform] : null,
        direction: run?.pdfJsDirection ?? null,
        hasEOL: run?.pdfJsHasEOL ?? null,
        widthPt: run?.pdfJsWidth ?? pdfJsWidthPt,
        heightPt: span.boundsPt.heightPt,
        boundsPt: { ...span.boundsPt },
      },
      font: {
        resourceName: span.style.fontResourceName,
        baseFont: profile?.baseFont ?? span.style.baseFont ?? null,
        normalizedFamily: profile?.familyName ?? span.style.fontFamily ?? null,
        subsetPrefix: subsetPrefix(profile?.baseFont ?? span.style.baseFont ?? null),
        subtype: profile?.kind ?? span.style.fontSubtype ?? null,
        objectRef: profile?.resourceIdentity.fontObjectRef ?? null,
        descriptorRef: profile?.resourceIdentity.descriptorObjectRef ?? null,
        descendantRef: profile?.resourceIdentity.descendantObjectRef ?? null,
        fontProgramRef: profile?.resourceIdentity.fontProgramObjectRef ?? null,
        toUnicodeRef: profile?.resourceIdentity.toUnicodeObjectRef ?? null,
        encodingRef: profile?.resourceIdentity.encodingObjectRef ?? null,
        descriptorFontName: profile?.resourceIdentity.descriptorFontName ?? null,
        descendantSubtype: profile?.resourceIdentity.descendantSubtype ?? null,
        descendantBaseFont: profile?.resourceIdentity.descendantBaseFont ?? null,
        embedded: profile?.isEmbedded ?? null,
        embeddedProgramByteLength: profile?.embeddedProgramByteLength ?? null,
        embeddedProgramSha256: profile?.embeddedProgramSha256 ?? null,
        embeddedCmapFormats: profile?.embeddedGlyphCoverage?.formats ?? [],
        embeddedGlyphCount: profile?.embeddedGlyphCoverage?.glyphCount ?? null,
        embeddedUnicodeSubtableCount:
          profile?.embeddedGlyphCoverage?.unicodeSubtableCount ?? 0,
        embeddedGlyphEvidenceSafeForSimplePdfEncoding:
          profile?.embeddedGlyphEvidence?.safeForSimplePdfEncoding ?? false,
        encodingType: profile?.encodingSource ?? null,
        encodingDifferences: null,
        toUnicodeAvailable: profile ? profile.encodingSource === "ToUnicode" : null,
        cmap: profile?.resourceIdentity.type0Encoding ?? null,
        writingMode: profile?.resourceIdentity.writingMode ?? null,
        cidSystemInfo: profile?.resourceIdentity.cidSystemInfo ?? null,
        cidToGidMap: profile?.resourceIdentity.cidToGidMap ?? null,
        glyphIds: provenEmbeddedGlyphIds,
        browserPreviewCapability: profile?.browserPreviewPossible ?? null,
        nativeRewriteCapability: rewriteCapability(span.capability),
      },
      geometry: {
        fontSizePt: span.style.fontSizePt,
        sourceTextRenderingMatrix: span.sourceMatrix ? [...span.sourceMatrix] : null,
        textMatrix: match?.operator.textMatrix ? [...match.operator.textMatrix] : null,
        textLineMatrix: match?.operator.textLineMatrix ? [...match.operator.textLineMatrix] : null,
        ctm: match?.operator.ctm ? [...match.operator.ctm] : null,
        baselinePt: span.baselinePt,
        rotationDeg: span.rotationDeg,
        skewDeg: skewDeg(span.sourceMatrix),
        horizontalScalingPct: span.style.horizontalScalingPct,
        characterSpacingPt: span.style.charSpacingPt,
        wordSpacingPt: span.style.wordSpacingPt,
        textRisePt: span.style.textRisePt,
        renderMode: span.style.renderingMode,
        nativeGlyphAdvanceExcludingTjAdjustmentsPt: nativeAdvance,
        pdfJsWidthPt,
        widthDeltaPt: nativeAdvance === null ? null : pdfJsWidthPt - nativeAdvance,
        fontSizeDeltaPt:
          match ? run?.fontSizePt === undefined ? null : run.fontSizePt - match.operator.fontSizePt : null,
        baselineDeltaPt: null,
      },
      paint: {
        fillColor: span.style.fillColor,
        strokeColor: span.style.strokeColor,
        fillOpacity: span.style.fillOpacity,
        strokeOpacity: span.style.strokeOpacity,
      },
      capability: {
        level: span.capability,
        reason: span.capabilityReason,
      },
      unresolvedEvidence: [...unresolved].sort(),
    };
  });

  return {
    schemaVersion: EDIT_PDF_DIAGNOSTIC_SCHEMA_VERSION,
    generatedAtIso,
    pageNumber: pageModel.pageIndex + 1,
    page: {
      widthPt: pageModel.widthPt,
      heightPt: pageModel.heightPt,
      capability: pageModel.capability,
      spanCount: pageModel.spans.length,
      editableSpanCount: pageModel.editableSpanCount,
      viewOnlySpanCount: pageModel.viewOnlySpanCount,
      unsupportedSpanCount: pageModel.unsupportedSpanCount,
    },
    signals: {
      nativeSpanCount: nativeSpans.length,
      pdfJsRunCount,
      classification: pageClassification,
      reconciliations,
    },
    spans,
  };
}

export function downloadEditPdfDiagnosticReport(
  report: EditPdfPageDiagnosticReport,
  fileName = `lumeo-edit-diagnostics-page-${report.pageNumber}.json`,
): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") {
    throw new Error("Diagnostic downloads are only available in a browser.");
  }
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(url);
}
