import { PDFDict, PDFName, PDFRawStream, type PDFDocument } from "pdf-lib";
import { equivalentPdfObjectTree } from "../optimization/losslessIntegrity.ts";
import { normalizeRotation } from "../rotation.ts";

type MergeSource = Readonly<{ source: PDFDocument; rotation: 0 | 90 | 180 | 270 }>;
type OutputFormat = "original" | "smartA4Portrait" | "smartA4Landscape" | "matchFirst";

function sameBox(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return (["x", "y", "width", "height"] as const).every(
    (name) => Number.isFinite(left[name]) && Number.isFinite(right[name]) &&
      Math.abs(left[name] - right[name]) < 0.001,
  );
}

function hasNativePageForm(merged: PDFDocument, pageIndex: number): boolean {
  const page = merged.getPage(pageIndex);
  const xobjects = page.node.Resources()?.lookup(PDFName.of("XObject"));
  if (!(xobjects instanceof PDFDict)) return false;
  return xobjects.values().some((value) => {
    const stream = merged.context.lookup(value);
    return stream instanceof PDFRawStream &&
      stream.dict.lookup(PDFName.of("Subtype")) === PDFName.of("Form") &&
      stream.getContents().byteLength > 0;
  });
}

/**
 * Certify the actual *serialized output*, not just the in-memory merge plan.
 * For original-size copies verify the exact source content stream and font,
 * image, vector and nested resource graph bytes across changed indirect refs.
 * The only permitted page change is the requested 90-degree-step rotation.
 *
 * Fitted formats legitimately wrap native operators in a Form XObject, so
 * require its nonempty native embedded stream, page dimensions and unrotated
 * output. Browser PDF.js text/visual tests separately certify fitted content.
 *
 * Any uncertainty rejects the output before download; never return an
 * unverified smaller/simpler PDF in place of original native content.
 */
export function certifyNativeMergePages(
  sources: readonly MergeSource[],
  merged: PDFDocument,
  format: OutputFormat,
  targetSize: { width: number; height: number },
): void {
  const expectedPages = sources.reduce((sum, entry) => sum + entry.source.getPageCount(), 0);
  if (!expectedPages || merged.getPageCount() !== expectedPages) {
    throw new Error("Native merge integrity failed: output page count differs from the sources.");
  }

  let outputIndex = 0;
  for (const { source, rotation } of sources) {
    for (const page of source.getPages()) {
      const output = merged.getPage(outputIndex);
      if (format === "original") {
        const expectedRotation = normalizeRotation(page.getRotation().angle + rotation);
        if (output.getRotation().angle !== expectedRotation ||
            !sameBox(page.getMediaBox(), output.getMediaBox()) ||
            !sameBox(page.getCropBox(), output.getCropBox()) ||
            !equivalentPdfObjectTree(source, page.node.Contents(), merged, output.node.Contents()) ||
            !equivalentPdfObjectTree(source, page.node.Resources(), merged, output.node.Resources())) {
          throw new Error("Native merge integrity failed: original page geometry, operators or resources changed.");
        }
      } else {
        const size = output.getSize();
        if (Math.abs(size.width - targetSize.width) > 0.001 ||
            Math.abs(size.height - targetSize.height) > 0.001 ||
            output.getRotation().angle !== 0 ||
            !hasNativePageForm(merged, outputIndex)) {
          throw new Error("Native merge integrity failed: fitted page has no verifiable native embedded content.");
        }
      }
      outputIndex += 1;
    }
  }
}
