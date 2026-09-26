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

function snapshotOperator(located: LocatedTextOperator): OperatorSnapshot {
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

function decodeTarget(
  registry: PdfFontRegistry,
  located: readonly LocatedTextOperator[],
): string | null {
  let text = "";
  for (const entry of located) {
    const resourceName = entry.operator.fontResourceName;
    if (!resourceName) return null;
    const profile = registry.resolve(entry.resources, resourceName);
    if (!profile) return null;
    const decoded = decodeTextShowOperator(
      entry.operator,
      profile.resolvedFont,
    );
    if (!decoded.allDecoded) return null;
    text += decoded.text;
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
      operators: located.map(snapshotOperator),
      decodedText: decodeTarget(registry, located),
    });
  }

  return { ok: true, snapshots, pageCount: doc.getPageCount() };
}

async function verifyWithPdfJs({
  sourceBytes,
  exportedBytes,
  snapshots,
}: {
  sourceBytes: ArrayBuffer | Uint8Array;
  exportedBytes: Uint8Array;
  snapshots: readonly NativeTargetSnapshot[];
}): Promise<
  | { ok: true; pagesChecked: number }
  | { ok: false; pagesChecked: number; reason: string }
> {
  const sourceDoc = await openPdfJsDocument(
    sourceBytes instanceof Uint8Array
      ? sourceBytes.slice()
      : sourceBytes.slice(0),
  );
  let exportedDoc: Awaited<ReturnType<typeof openPdfJsDocument>> | null =
    null;
  let pagesChecked = 0;

  try {
    exportedDoc = await openPdfJsDocument(exportedBytes.slice());

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
        if (!expected || !sourceText.includes(expected)) {
          // Native-only or deleted/empty text cannot be usefully proven by
          // PDF.js. The native structural proof still covers it exactly.
          continue;
        }
        if (!exportedText.includes(expected)) {
          return {
            ok: false,
            pagesChecked,
            reason:
              `PDF.js could not find the committed native text on page ${pageIndex + 1} ` +
              "after reopening the export.",
          };
        }
      }

      pagesChecked += 1;
    }
    return { ok: true, pagesChecked };
  } finally {
    const sourceDestroy = (
      sourceDoc as { destroy?: () => Promise<void> | void }
    ).destroy;
    if (typeof sourceDestroy === "function") {
      await sourceDestroy.call(sourceDoc);
    }
    if (exportedDoc) {
      const exportedDestroy = (
        exportedDoc as { destroy?: () => Promise<void> | void }
      ).destroy;
      if (typeof exportedDestroy === "function") {
        await exportedDestroy.call(exportedDoc);
      }
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
}: {
  sourceBytes: ArrayBuffer | Uint8Array;
  exportedBytes: Uint8Array;
  session: PdfEditSessionState;
  verifyPdfJs?: boolean;
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
        const actual = snapshotOperator(candidate);
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
