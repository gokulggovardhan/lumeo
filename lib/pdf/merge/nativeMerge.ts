import { degrees, PDFDocument, PDFName, rgb } from "pdf-lib";
import { normalizeRotation } from "../rotation.ts";
import { validatePdfOutput } from "../optimization/validateOutput.ts";

/**
 * Browser-independent native PDF merge core. Never converts pages to images.
 * An input is intentionally kept immutable; PDFDocument.load operates on its
 * own object graph. All output is checked before it can be downloaded.
 */
export type NativeMergeFormat = "original" | "smartA4Portrait" | "smartA4Landscape" | "matchFirst";
export type NativeMergeInput = { name: string; bytes: ArrayBuffer; rotation: number };
export type NativeMergeOptions = {
  format: NativeMergeFormat;
  marginPoints: number;
  signal?: AbortSignal;
  onProgress?: (completedPages: number, totalPages: number) => void;
};
export type NativeMergeOutput = { bytes: ArrayBuffer; pageCount: number };

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
// PDF manipulation expands compressed object streams in memory. Fail closed
// before allowing a collection of independent 80 MB files to exhaust a phone.
export const MAX_MERGE_INPUT_BYTES = 128 * 1024 * 1024;
export const MAX_MERGE_PAGES = 600;

function assertMergeActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Merge cancelled.", "AbortError");
}

function requireLegalRotation(value: number): 0 | 90 | 180 | 270 {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value % 90 !== 0) {
    throw new Error("A source page contains an unsupported rotation.");
  }
  return normalizeRotation(value);
}

/**
 * A new merged PDF cannot safely retain independent signed byte ranges,
 * form field trees, bookmarks with cross-file destinations or interactive
 * annotations through pdf-lib's page copy/embed primitives. Refuse these
 * inputs explicitly instead of silently returning a damaged interactive PDF.
 */
function assertSafeToMerge(source: PDFDocument): void {
  for (const feature of ["Perms", "AcroForm", "Outlines", "Names", "AF", "StructTreeRoot", "OutputIntents"] as const) {
    if (source.catalog.has(PDFName.of(feature))) {
      throw new Error("This PDF has protected or interactive document structure that cannot be merged safely in this mode. Keep the original file.");
    }
  }
  for (const page of source.getPages()) {
    const annots = page.node.Annots();
    if (annots && annots.size() > 0) {
      throw new Error("This PDF has links, annotations or form controls that cannot be merged safely in this mode. Keep the original file.");
    }
  }
}

/** Layout math is pure and can be tested independently of the browser. */
export function nativePagePlacement({
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
  marginPoints,
  clockwiseDegrees,
}: {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  marginPoints: number;
  clockwiseDegrees: number;
}) {
  const rotation = requireLegalRotation(clockwiseDegrees);
  if ([sourceWidth, sourceHeight, targetWidth, targetHeight].some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Invalid PDF page dimensions.");
  }
  if (!Number.isFinite(marginPoints) || marginPoints < 0 || marginPoints * 2 >= Math.min(targetWidth, targetHeight)) {
    throw new Error("The selected page margins leave no room for content.");
  }
  const quarterTurn = rotation === 90 || rotation === 270;
  const rotatedWidth = quarterTurn ? sourceHeight : sourceWidth;
  const rotatedHeight = quarterTurn ? sourceWidth : sourceHeight;
  const scale = Math.min(
    (targetWidth - 2 * marginPoints) / rotatedWidth,
    (targetHeight - 2 * marginPoints) / rotatedHeight,
  );
  // PDF page /Rotate denotes clockwise rotation; drawPage's content
  // transform uses counterclockwise degrees. Reconcile the two explicitly.
  const counterClockwise = normalizeRotation(360 - rotation);
  const left = (targetWidth - rotatedWidth * scale) / 2;
  const bottom = (targetHeight - rotatedHeight * scale) / 2;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  return {
    x: left + (counterClockwise === 90 ? drawHeight : counterClockwise === 180 ? drawWidth : 0),
    y: bottom + (counterClockwise === 180 ? drawHeight : counterClockwise === 270 ? drawWidth : 0),
    width: drawWidth,
    height: drawHeight,
    counterClockwise,
    rotatedWidth: rotatedWidth * scale,
    rotatedHeight: rotatedHeight * scale,
  };
}

export async function mergeNativeDocuments(
  inputs: readonly NativeMergeInput[],
  options: NativeMergeOptions,
): Promise<NativeMergeOutput> {
  if (inputs.length < 2) throw new Error("Select at least two PDF files.");
  assertMergeActive(options.signal);
  const inputSize = inputs.reduce((sum, item) => sum + item.bytes.byteLength, 0);
  if (inputSize > MAX_MERGE_INPUT_BYTES) {
    throw new Error("These files exceed this device-safe merge size. Merge fewer files at once.");
  }
  if (!Number.isFinite(options.marginPoints) || options.marginPoints < 0) {
    throw new Error("Invalid output margin.");
  }

  const sources: Array<{ source: PDFDocument; rotation: 0 | 90 | 180 | 270 }> = [];
  let totalPages = 0;
  for (const input of inputs) {
    assertMergeActive(options.signal);
    const source = await PDFDocument.load(input.bytes, { ignoreEncryption: false });
    assertMergeActive(options.signal);
    if (source.getPageCount() === 0) throw new Error("An input PDF has no pages.");
    assertSafeToMerge(source);
    totalPages += source.getPageCount();
    if (totalPages > MAX_MERGE_PAGES) {
      throw new Error("This merge has too many pages for a safe browser session. Merge smaller batches.");
    }
    sources.push({ source, rotation: requireLegalRotation(input.rotation) });
  }

  const firstPage = sources[0].source.getPage(0);
  const first = firstPage.getCropBox();
  const firstDisplayRotation = normalizeRotation(
    requireLegalRotation(firstPage.getRotation().angle) + sources[0].rotation,
  );
  const firstIsQuarterTurn = firstDisplayRotation === 90 || firstDisplayRotation === 270;
  const firstDisplayedSize = firstIsQuarterTurn
    ? { width: first.height, height: first.width }
    : { width: first.width, height: first.height };
  const pageSize =
    options.format === "smartA4Landscape" ? { width: A4_HEIGHT, height: A4_WIDTH }
      : options.format === "matchFirst" ? firstDisplayedSize
        : { width: A4_WIDTH, height: A4_HEIGHT };

  const merged = await PDFDocument.create();
  let completedPages = 0;

  for (const { source, rotation } of sources) {
    assertMergeActive(options.signal);
    if (options.format === "original") {
      // Native /Rotate retains page content, fonts, searchable text and page
      // boxes. No full-page JPEG rasterisation, even at 90/180/270 degrees.
      const pages = await merged.copyPages(source, source.getPageIndices());
      for (const page of pages) {
        assertMergeActive(options.signal);
        const existing = requireLegalRotation(page.getRotation().angle);
        page.setRotation(degrees(normalizeRotation(existing + rotation)));
        merged.addPage(page);
        completedPages += 1;
        options.onProgress?.(completedPages, totalPages);
      }
      continue;
    }

    for (const sourcePage of source.getPages()) {
      assertMergeActive(options.signal);
      const sourceRotation = requireLegalRotation(sourcePage.getRotation().angle);
      const crop = sourcePage.getCropBox();
      const placement = nativePagePlacement({
        sourceWidth: crop.width,
        sourceHeight: crop.height,
        targetWidth: pageSize.width,
        targetHeight: pageSize.height,
        marginPoints: options.marginPoints,
        clockwiseDegrees: normalizeRotation(sourceRotation + rotation),
      });
      // Embed precisely the visible CropBox, not the entire MediaBox.
      // Otherwise a fitted output could reveal visually hidden source
      // margins or shift native content relative to the placement math.
      const embedded = await merged.embedPage(sourcePage, {
        left: crop.x,
        bottom: crop.y,
        right: crop.x + crop.width,
        top: crop.y + crop.height,
      });
      const page = merged.addPage([pageSize.width, pageSize.height]);
      page.drawRectangle({ x: 0, y: 0, width: pageSize.width, height: pageSize.height, color: rgb(1, 1, 1) });
      page.drawPage(embedded, {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        rotate: degrees(placement.counterClockwise),
      });
      completedPages += 1;
      options.onProgress?.(completedPages, totalPages);
    }
  }

  assertMergeActive(options.signal);
  const result = await merged.save({ useObjectStreams: true });
  assertMergeActive(options.signal);
  if (!result.byteLength) throw new Error("The merged PDF is empty.");
  await validatePdfOutput(result, totalPages);
  assertMergeActive(options.signal);
  return {
    bytes: result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer,
    pageCount: totalPages,
  };
}
