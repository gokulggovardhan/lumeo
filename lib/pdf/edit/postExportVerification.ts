import { PDFDocument } from "pdf-lib";
import type {
  Matrix2x3,
  PdfPaintColor,
  TextShowOperator,
} from "./contentStream.ts";
import type {
  NativeTextTarget,
  PdfEditSessionState,
} from "./editSession.ts";
import {
  collectPageTextOperators,
  type LocatedTextOperator,
  type StreamLocator,
} from "./formXObjects.ts";
import { PdfFontRegistry } from "./fontRegistry.ts";
import { decodeTextShowOperator } from "./editPlan.ts";
import { openPdfJsDocument } from "../pdfjs.ts";

const NUMBER_EPSILON = 1e-6;
// PDF.js source/export transforms are produced by the same pinned renderer.
// 0.05pt is < 1/1400 inch: large enough for harmless parser float
// normalization, far smaller than a visible baseline/position shift.
const PDFJS_TRANSFORM_TOLERANCE_PT = 0.05;
const PDFJS_NATIVE_MATCH_MAX_DISTANCE_PT = 2;

type PdfJsTextItemLike = {
  str: string;
  transform: readonly number[];
};
type PdfJsTextContentLike = {
  items: readonly (PdfJsTextItemLike | { type: string })[];
};
type PdfJsPageLike = {
  getTextContent: () => Promise<PdfJsTextContentLike>;
};
type PdfJsDocumentLike = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPageLike>;
  destroy?: () => Promise<void> | void;
};

export type PostExportPdfJsOpener = (
  data: ArrayBuffer | Uint8Array,
) => Promise<PdfJsDocumentLike>;

const defaultPdfJsOpener: PostExportPdfJsOpener = async (data) =>
  (await openPdfJsDocument(data)) as unknown as PdfJsDocumentLike;

export type PostExportNativeVerificationResult =
  | {
      ok: true;
      status: "not-needed";
      checkedTargets: 0;
      checkedOperators: 0;
      pdfJsPagesChecked: 0;
      reason: null;
    }
  | {
      ok: true;
      status: "verified";
      checkedTargets: number;
      checkedOperators: number;
      pdfJsPagesChecked: number;
      reason: null;
    }
  | {
      ok: false;
      status: "failed";
      checkedTargets: number;
      checkedOperators: number;
      pdfJsPagesChecked: number;
      reason: string;
    };

type NativeTargetSnapshot = {
  key: string;
  target: NativeTextTarget;
  operators: OperatorSnapshot[];
  decodedText: string | null;
};

type OperatorSnapshot = {
  operatorIndex: number;
  locator: StreamLocator;
  kind: TextShowOperator["kind"];
  rawStringsHex: string[];
  tjAdjustments: number[] | null;
  fontResourceName: string | null;
  fontSizePt: number;
  textRenderingMatrix: Matrix2x3;
  textMatrix: Matrix2x3 | null;
  textLineMatrix: Matrix2x3 | null;
  ctm: Matrix2x3 | null;
  charSpacing: number;
  wordSpacing: number;
  horizontalScalingPct: number;
  leading: number;
  textRise: number;
  renderMode: number;
  fillColor: PdfPaintColor | null;
  strokeColor: PdfPaintColor | null;
  fillOpacity: number | null;
  strokeOpacity: number | null;
  decodedText: string | null;
};

function failed({
  reason,
  checkedTargets = 0,
  checkedOperators = 0,
  pdfJsPagesChecked = 0,
}: {
  reason: string;
  checkedTargets?: number;
  checkedOperators?: number;
  pdfJsPagesChecked?: number;
}): PostExportNativeVerificationResult {
  return {
    ok: false,
    status: "failed",
    checkedTargets,
    checkedOperators,
    pdfJsPagesChecked,
    reason,
  };
}

function targetKey(target: NativeTextTarget): string {
  const locator = target.formPath
    ? `form:${target.formPath.join("/")}`
    : `page-stream:${target.contentStreamIndex ?? "?"}`;
  return [
    target.pageIndex,
    locator,
    [...target.operatorIndices].sort((a, b) => a - b).join(","),
  ].join("|");
}

function nativeTargets(session: PdfEditSessionState): NativeTextTarget[] {
  const byKey = new Map<string, NativeTextTarget>();
  for (const operation of session.operations) {
    if (
      operation.kind !== "replaceText" &&
      operation.kind !== "deleteText" &&
      operation.kind !== "changeStyle"
    ) {
      continue;
    }
    if (operation.target.kind !== "native-text") continue;
    byKey.set(targetKey(operation.target), operation.target);
  }
  return [...byKey.values()];
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function cloneMatrix(value: readonly number[] | undefined): Matrix2x3 | null {
  if (!value || value.length !== 6) return null;
  return [...value] as Matrix2x3;
}

function clonePaint(value: PdfPaintColor | null | undefined): PdfPaintColor | null {
  return value
    ? {
        colorSpace: value.colorSpace,
        components: [...value.components],
        cssHex: value.cssHex,
      }
    : null;
}

function snapshotOperator(
  located: LocatedTextOperator,
  decodedText: string | null,
): OperatorSnapshot {
  const operator = located.operator;
  return {
    operatorIndex: located.operatorIndex,
    locator: located.locator,
    kind: operator.kind,
    rawStringsHex: operator.strings.map(bytesToHex),
    tjAdjustments: operator.tjAdjustments
      ? [...operator.tjAdjustments]
      : null,
    fontResourceName: operator.fontResourceName,
    fontSizePt: operator.fontSizePt,
    textRenderingMatrix: [...operator.textRenderingMatrix] as Matrix2x3,
    textMatrix: cloneMatrix(operator.textMatrix),
    textLineMatrix: cloneMatrix(operator.textLineMatrix),
    ctm: cloneMatrix(operator.ctm),
    charSpacing: operator.charSpacing,
    wordSpacing: operator.wordSpacing,
    horizontalScalingPct: operator.horizontalScalingPct,
    leading: operator.leading,
    textRise: operator.textRise,
    renderMode: operator.renderMode,
    fillColor: clonePaint(operator.fillColor),
    strokeColor: clonePaint(operator.strokeColor),
    fillOpacity: operator.fillOpacity ?? null,
    strokeOpacity: operator.strokeOpacity ?? null,
    decodedText,
  };
}

function arraysEqual<T>(
  left: readonly T[] | null,
  right: readonly T[] | null,
  compare: (a: T, b: T) => boolean,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.length === right.length &&
    left.every((value, index) => compare(value, right[index]))
  );
}

function numbersEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= NUMBER_EPSILON;
}

function nullableNumbersEqual(
  left: number | null,
  right: number | null,
): boolean {
  return left === null || right === null
    ? left === right
    : numbersEqual(left, right);
}

function matricesEqual(
  left: Matrix2x3 | null,
  right: Matrix2x3 | null,
): boolean {
  return arraysEqual(left, right, numbersEqual);
}

function paintsEqual(
  left: PdfPaintColor | null,
  right: PdfPaintColor | null,
): boolean {
  if (!left || !right) return left === right;
  return (
    left.colorSpace === right.colorSpace &&
    left.cssHex === right.cssHex &&
    arraysEqual(left.components, right.components, numbersEqual)
  );
}

function sameLocator(left: StreamLocator, right: StreamLocator): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "page" && right.kind === "page") {
    return left.contentStreamIndex === right.contentStreamIndex;
  }
  if (left.kind === "xobject" && right.kind === "xobject") {
    return arraysEqual(left.formPath, right.formPath, (a, b) => a === b);
  }
  return false;
}

function targetLocatorMatches(
  target: NativeTextTarget,
  located: LocatedTextOperator,
): boolean {
  if (target.formPath) {
    return (
      located.locator.kind === "xobject" &&
      arraysEqual(
        target.formPath,
        located.locator.formPath,
        (a, b) => a === b,
      )
    );
  }
  return (
    located.locator.kind === "page" &&
    located.locator.contentStreamIndex === target.contentStreamIndex
  );
}

function operatorStateEquals(
  expected: OperatorSnapshot,
  actual: OperatorSnapshot,
): boolean {
  return (
    expected.kind === actual.kind &&
    arraysEqual(
      expected.rawStringsHex,
      actual.rawStringsHex,
      (a, b) => a === b,
    ) &&
    arraysEqual(
      expected.tjAdjustments,
      actual.tjAdjustments,
      numbersEqual,
    ) &&
    expected.fontResourceName === actual.fontResourceName &&
    numbersEqual(expected.fontSizePt, actual.fontSizePt) &&
    matricesEqual(
      expected.textRenderingMatrix,
      actual.textRenderingMatrix,
    ) &&
    matricesEqual(expected.textMatrix, actual.textMatrix) &&
    matricesEqual(expected.textLineMatrix, actual.textLineMatrix) &&
    matricesEqual(expected.ctm, actual.ctm) &&
    numbersEqual(expected.charSpacing, actual.charSpacing) &&
    numbersEqual(expected.wordSpacing, actual.wordSpacing) &&
    numbersEqual(
      expected.horizontalScalingPct,
      actual.horizontalScalingPct,
    ) &&
    numbersEqual(expected.leading, actual.leading) &&
    numbersEqual(expected.textRise, actual.textRise) &&
    expected.renderMode === actual.renderMode &&
    paintsEqual(expected.fillColor, actual.fillColor) &&
    paintsEqual(expected.strokeColor, actual.strokeColor) &&
    nullableNumbersEqual(expected.fillOpacity, actual.fillOpacity) &&
    nullableNumbersEqual(expected.strokeOpacity, actual.strokeOpacity)
  );
}

/**
 * If pdf-lib appends an overlay content stream, the original page stream's
 * array index may move even though the native text itself is untouched.
 * Exact locator + operatorIndex is preferred; this fallback is used only
 * when that exact locator disappeared and requires a UNIQUE operator with
 * the same text-show ordinal, font and PDF-space text-rendering matrix.
 */
function fallbackIdentityMatches(
  expected: OperatorSnapshot,
  candidate: LocatedTextOperator,
): boolean {
  return (
    candidate.operatorIndex === expected.operatorIndex &&
    candidate.operator.fontResourceName === expected.fontResourceName &&
    matricesEqual(
      expected.textRenderingMatrix,
      cloneMatrix(candidate.operator.textRenderingMatrix),
    )
  );
}

function findExportedCandidate(
  expected: OperatorSnapshot,
  pageOperators: readonly LocatedTextOperator[],
): LocatedTextOperator | null {
  const exact = pageOperators.find(
    (candidate) =>
      candidate.operatorIndex === expected.operatorIndex &&
      sameLocator(candidate.locator, expected.locator),
  );
  if (exact) return exact;

  const fallback = pageOperators.filter((candidate) =>
    fallbackIdentityMatches(expected, candidate),
  );
  return fallback.length === 1 ? fallback[0] : null;
}

function normalizeVisibleText(value: string): string {
  return value.replace(/\s+/gu, "");
}

function operationPageIndices(targets: readonly NativeTextTarget[]): number[] {
  return [...new Set(targets.map((target) => target.pageIndex))].sort(
    (a, b) => a - b,
  );
}

function decodeLocatedOperator(
  registry: PdfFontRegistry,
  entry: LocatedTextOperator,
): string | null {
  const resourceName = entry.operator.fontResourceName;
  if (!resourceName) return null;
  const profile = registry.resolve(entry.resources, resourceName);
  if (!profile) return null;
  const decoded = decodeTextShowOperator(
    entry.operator,
    profile.resolvedFont,
  );
  return decoded.allDecoded ? decoded.text : null;
}

function decodeTarget(
  registry: PdfFontRegistry,
  located: readonly LocatedTextOperator[],
): string | null {
  let text = "";
  for (const entry of located) {
    const decoded = decodeLocatedOperator(registry, entry);
    if (decoded === null) return null;
    text += decoded;
  }
  return text;
}

async function buildSnapshots(
  bytes: ArrayBuffer | Uint8Array,
  targets: readonly NativeTextTarget[],
): Promise<
  | { ok: true; snapshots: NativeTargetSnapshot[]; pageCount: number }
  | { ok: false; reason: string }
> {
  const doc = await PDFDocument.load(
    bytes instanceof Uint8Array ? bytes.slice() : bytes.slice(0),
  );
  const registry = new PdfFontRegistry(doc);
  const byPage = new Map<number, LocatedTextOperator[]>();

  for (const target of targets) {
    if (target.pageIndex < 0 || target.pageIndex >= doc.getPageCount()) {
      return {
        ok: false,
        reason:
          `A committed native edit still points to page ${target.pageIndex + 1}, ` +
          "but that page no longer exists in the current document.",
      };
    }
    if (!byPage.has(target.pageIndex)) {
      byPage.set(
        target.pageIndex,
        collectPageTextOperators(doc, target.pageIndex),
      );
    }
  }

  const snapshots: NativeTargetSnapshot[] = [];
  for (const target of targets) {
    const pageOperators = byPage.get(target.pageIndex) ?? [];
    const selected = [...target.operatorIndices]
      .sort((a, b) => a - b)
      .map((operatorIndex) =>
        pageOperators.find(
          (candidate) =>
            candidate.operatorIndex === operatorIndex &&
            targetLocatorMatches(target, candidate),
        ),
      );

    if (selected.some((item) => !item)) {
      return {
        ok: false,
        reason:
          `Lumeo could not resolve a committed native-text target on page ${target.pageIndex + 1} ` +
          "in the current PDF. A later page/stream operation may have changed its structural identity.",
      };
    }

    const located = selected as LocatedTextOperator[];
    snapshots.push({
      key: targetKey(target),
      target,
      operators: located.map((entry) =>
        snapshotOperator(
          entry,
          decodeLocatedOperator(registry, entry),
        ),
      ),
      decodedText: decodeTarget(registry, located),
    });
  }

  return { ok: true, snapshots, pageCount: doc.getPageCount() };
}

function isPdfJsTextItem(
  item: PdfJsTextItemLike | { type: string },
): item is PdfJsTextItemLike {
  return "str" in item && Array.isArray(item.transform);
}

function textSequenceTransforms(
  content: PdfJsTextContentLike,
  expectedText: string,
): Matrix2x3[] {
  const expected = normalizeVisibleText(expectedText);
  if (!expected) return [];

  const items = content.items.filter(isPdfJsTextItem);
  const matches: Matrix2x3[] = [];
  for (let start = 0; start < items.length; start += 1) {
    let combined = "";
    for (let end = start; end < items.length; end += 1) {
      combined += normalizeVisibleText(items[end].str);
      if (!combined) continue;
      if (combined === expected) {
        const transform = cloneMatrix(items[start].transform);
        if (transform) matches.push(transform);
        break;
      }
      if (combined.length > expected.length) break;
    }
  }
  return matches;
}

function translationDistance(
  left: Matrix2x3,
  right: Matrix2x3,
): number {
  return Math.hypot(left[4] - right[4], left[5] - right[5]);
}

function nearestTransform(
  candidates: readonly Matrix2x3[],
  reference: Matrix2x3,
): Matrix2x3 | null {
  let best: Matrix2x3 | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = translationDistance(candidate, reference);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function pdfJsTransformsEqual(
  left: Matrix2x3,
  right: Matrix2x3,
): boolean {
  return left.every(
    (value, index) =>
      Math.abs(value - right[index]) <= PDFJS_TRANSFORM_TOLERANCE_PT,
  );
}

async function verifyWithPdfJs({
  sourceBytes,
  exportedBytes,
  snapshots,
  openPdfJs,
}: {
  sourceBytes: ArrayBuffer | Uint8Array;
  exportedBytes: Uint8Array;
  snapshots: readonly NativeTargetSnapshot[];
  openPdfJs: PostExportPdfJsOpener;
}): Promise<
  | { ok: true; pagesChecked: number }
  | { ok: false; pagesChecked: number; reason: string }
> {
  const sourceDoc = await openPdfJs(
    sourceBytes instanceof Uint8Array
      ? sourceBytes.slice()
      : sourceBytes.slice(0),
  );
  let exportedDoc: PdfJsDocumentLike | null = null;
  let pagesChecked = 0;

  try {
    exportedDoc = await openPdfJs(exportedBytes.slice());

    if (sourceDoc.numPages !== exportedDoc.numPages) {
      return {
        ok: false,
        pagesChecked,
        reason:
          `PDF.js reopened the export with ${exportedDoc.numPages} pages, ` +
          `but the committed source has ${sourceDoc.numPages}.`,
      };
    }

    const pages = operationPageIndices(
      snapshots.map((snapshot) => snapshot.target),
    );
    for (const pageIndex of pages) {
      const [sourcePage, exportedPage] = await Promise.all([
        sourceDoc.getPage(pageIndex + 1),
        exportedDoc.getPage(pageIndex + 1),
      ]);
      const [sourceContent, exportedContent] = await Promise.all([
        sourcePage.getTextContent(),
        exportedPage.getTextContent(),
      ]);
      const sourceText = normalizeVisibleText(
        sourceContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(""),
      );
      const exportedText = normalizeVisibleText(
        exportedContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(""),
      );

      for (const snapshot of snapshots) {
        if (snapshot.target.pageIndex !== pageIndex) continue;
        const expected = snapshot.decodedText
          ? normalizeVisibleText(snapshot.decodedText)
          : "";
        if (expected && sourceText.includes(expected) && !exportedText.includes(expected)) {
          return {
            ok: false,
            pagesChecked,
            reason:
              `PDF.js could not find the committed native text on page ${pageIndex + 1} ` +
              "after reopening the export.",
          };
        }

        // For each operator PDF.js can represent as the same exact logical
        // text sequence, compare its reopened transform too. Matching the
        // SOURCE sequence to the native matrix first prevents duplicate page
        // strings from authorizing the wrong occurrence. If PDF.js merged the
        // native run with unrelated adjacent text, the structural native proof
        // remains authoritative and this cross-engine geometry check is simply
        // unavailable rather than guessed.
        for (const operator of snapshot.operators) {
          const operatorText = operator.decodedText ?? "";
          const sourceCandidates = textSequenceTransforms(
            sourceContent,
            operatorText,
          );
          const sourceTransform = nearestTransform(
            sourceCandidates,
            operator.textRenderingMatrix,
          );
          if (
            !sourceTransform ||
            translationDistance(
              sourceTransform,
              operator.textRenderingMatrix,
            ) > PDFJS_NATIVE_MATCH_MAX_DISTANCE_PT
          ) {
            continue;
          }

          const exportedCandidates = textSequenceTransforms(
            exportedContent,
            operatorText,
          );
          const exportedTransform = nearestTransform(
            exportedCandidates,
            sourceTransform,
          );
          if (!exportedTransform) {
            return {
              ok: false,
              pagesChecked,
              reason:
                `PDF.js could not rematch committed native text geometry on page ${pageIndex + 1} after export.`,
            };
          }
          if (!pdfJsTransformsEqual(sourceTransform, exportedTransform)) {
            return {
              ok: false,
              pagesChecked,
              reason:
                `PDF.js detected a native text position/transform change on page ${pageIndex + 1} after export.`,
            };
          }
        }
      }

      pagesChecked += 1;
    }
    return { ok: true, pagesChecked };
  } finally {
    if (typeof sourceDoc.destroy === "function") {
      await sourceDoc.destroy();
    }
    if (exportedDoc && typeof exportedDoc.destroy === "function") {
      await exportedDoc.destroy();
    }
  }
}

/**
 * Reopens the just-exported PDF locally and proves that every committed
 * native-text target still has the same glyph bytes, font resource,
 * text/paint state and PDF-space geometry it had immediately before export.
 *
 * Overlay-only sessions return immediately: there is no native content-stream
 * mutation to protect. PDF.js is a second independent signal on affected
 * pages; it must reopen the export and retain any committed text it was able
 * to see in the pre-export source. DOM/CSS geometry is never consulted.
 */
export async function verifyPostExportNativeEdits({
  sourceBytes,
  exportedBytes,
  session,
  verifyPdfJs = true,
  openPdfJs = defaultPdfJsOpener,
}: {
  sourceBytes: ArrayBuffer | Uint8Array;
  exportedBytes: Uint8Array;
  session: PdfEditSessionState;
  verifyPdfJs?: boolean;
  openPdfJs?: PostExportPdfJsOpener;
}): Promise<PostExportNativeVerificationResult> {
  const targets = nativeTargets(session);
  if (targets.length === 0) {
    return {
      ok: true,
      status: "not-needed",
      checkedTargets: 0,
      checkedOperators: 0,
      pdfJsPagesChecked: 0,
      reason: null,
    };
  }

  try {
    const source = await buildSnapshots(sourceBytes, targets);
    if (!source.ok) return failed({ reason: source.reason });

    const exportedDoc = await PDFDocument.load(exportedBytes.slice());
    if (exportedDoc.getPageCount() !== source.pageCount) {
      return failed({
        reason:
          `The exported PDF reopened with ${exportedDoc.getPageCount()} pages, ` +
          `but the committed source has ${source.pageCount}.`,
      });
    }

    let checkedOperators = 0;
    const exportedByPage = new Map<number, LocatedTextOperator[]>();
    for (const snapshot of source.snapshots) {
      if (!exportedByPage.has(snapshot.target.pageIndex)) {
        if (
          snapshot.target.pageIndex < 0 ||
          snapshot.target.pageIndex >= exportedDoc.getPageCount()
        ) {
          return failed({
            reason:
              `The exported PDF no longer contains page ${snapshot.target.pageIndex + 1}, ` +
              "which holds a committed native-text edit.",
            checkedTargets: source.snapshots.indexOf(snapshot),
            checkedOperators,
          });
        }
        exportedByPage.set(
          snapshot.target.pageIndex,
          collectPageTextOperators(
            exportedDoc,
            snapshot.target.pageIndex,
          ),
        );
      }
      const pageOperators =
        exportedByPage.get(snapshot.target.pageIndex) ?? [];

      for (const expected of snapshot.operators) {
        const candidate = findExportedCandidate(expected, pageOperators);
        if (!candidate) {
          return failed({
            reason:
              `A committed native-text operator on page ${snapshot.target.pageIndex + 1} ` +
              "could not be located after export.",
            checkedTargets: source.snapshots.indexOf(snapshot),
            checkedOperators,
          });
        }
        const actual = snapshotOperator(candidate, expected.decodedText);
        if (!operatorStateEquals(expected, actual)) {
          return failed({
            reason:
              `Native text, font/style state, paint, or PDF-space geometry changed unexpectedly ` +
              `on page ${snapshot.target.pageIndex + 1} during export.`,
            checkedTargets: source.snapshots.indexOf(snapshot),
            checkedOperators,
          });
        }
        checkedOperators += 1;
      }
    }

    let pdfJsPagesChecked = 0;
    if (verifyPdfJs) {
      const pdfJs = await verifyWithPdfJs({
        sourceBytes,
        exportedBytes,
        snapshots: source.snapshots,
        openPdfJs,
      });
      pdfJsPagesChecked = pdfJs.pagesChecked;
      if (!pdfJs.ok) {
        return failed({
          reason: pdfJs.reason,
          checkedTargets: source.snapshots.length,
          checkedOperators,
          pdfJsPagesChecked,
        });
      }
    }

    return {
      ok: true,
      status: "verified",
      checkedTargets: source.snapshots.length,
      checkedOperators,
      pdfJsPagesChecked,
      reason: null,
    };
  } catch (error) {
    return failed({
      reason:
        error instanceof Error
          ? `Post-export verification failed: ${error.message}`
          : "Post-export verification failed for an unknown reason.",
    });
  }
}
