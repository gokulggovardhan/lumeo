import { PDFRawStream, type PDFDocument, type PDFRef } from "pdf-lib";
import { findEmbeddedJpegs } from "../embeddedImages.ts";
import { inspectPdfStructure, isCanonicalRgbJpegResource } from "../structuralEligibility.ts";

/**
 * Phase 05: conservative, per-document, per-indirect-image usage analysis.
 *
 * An image may be shared between aliases and pages of very different sizes.
 * We must size it for the LARGEST page envelope in which it occurs, not the
 * first page that happened to be iterated. The alias/ref itself is preserved.
 *
 * A Form XObject has its own graphics state and may reuse image references
 * through inherited resources. Until native Form drawing transforms can be
 * proven, do not transcode JPEGs in any document containing Forms. Native
 * lossless object-stream optimisation remains separately available.
 */
export type DocumentJpegCandidate = Readonly<{
  ref: PDFRef;
  bytes: Uint8Array;
  pageWidth: number;
  pageHeight: number;
  usedOnPages: number;
  namedAliases: number;
}>;

type MutableUsage = {
  ref: PDFRef;
  bytes: Uint8Array;
  pageWidth: number;
  pageHeight: number;
  pages: Set<number>;
  aliases: Set<string>;
};

export function collectDocumentJpegCandidates(pdf: PDFDocument): DocumentJpegCandidate[] {
  const inspection = inspectPdfStructure(pdf);
  if (!inspection.safeForCompression || inspection.totalFormXObjects > 0) return [];

  const byRef = new Map<string, MutableUsage>();
  for (const [index, page] of pdf.getPages().entries()) {
    const box = inspection.pages[index]?.cropBox;
    if (!box || !Number.isFinite(box.width) || !Number.isFinite(box.height) ||
        box.width <= 0 || box.height <= 0) return [];
    for (const jpeg of findEmbeddedJpegs(page)) {
      const stream = pdf.context.lookup(jpeg.ref);
      if (!(stream instanceof PDFRawStream) || !isCanonicalRgbJpegResource(stream)) {
        continue;
      }
      const key = jpeg.ref.toString();
      const existing = byRef.get(key);
      if (!existing) {
        byRef.set(key, {
          ref: jpeg.ref,
          bytes: jpeg.bytes,
          pageWidth: box.width,
          pageHeight: box.height,
          pages: new Set([index]),
          aliases: new Set([index + ":" + jpeg.name]),
        });
      } else {
        existing.pageWidth = Math.max(existing.pageWidth, box.width);
        existing.pageHeight = Math.max(existing.pageHeight, box.height);
        existing.pages.add(index);
        existing.aliases.add(index + ":" + jpeg.name);
      }
    }
  }
  // A caller must retain its independent 256-object memory budget.
  return [...byRef.values()].map((entry) => ({
    ref: entry.ref,
    bytes: entry.bytes,
    pageWidth: entry.pageWidth,
    pageHeight: entry.pageHeight,
    usedOnPages: entry.pages.size,
    namedAliases: entry.aliases.size,
  }));
}
