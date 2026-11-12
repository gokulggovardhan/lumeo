import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";
import { findEmbeddedJpegs, planEmbeddedJpegResize } from "../embeddedImages.ts";
import { validatePdfOutput } from "./validateOutput.ts";
import { inspectPdfStructure, isCanonicalRgbJpegResource } from "../structuralEligibility.ts";

export type NativeOptimizationMode = "lossless" | "smart" | "maximum";
export type NativeImageSettings = { dpi: number; quality: number };
export type NativeCompressionProgress = { completed: number; total: number; stage: "inspect" | "images" | "validate" };
export type NativeOptimizationResult = {
  bytes: ArrayBuffer;
  inputBytes: number;
  outputBytes: number;
  optimizedImages: number;
  analyzedImages: number;
  applied: boolean;
  protectedReason?: string;
  /** Worst accepted image candidate fidelity proxy when measured. */
  sampledFidelityScore?: number;
};

export type NativeJpegTranscodeOutcome = {
  bytes: Uint8Array;
  sampledFidelityScore: number;
};
export type JpegTranscoder = (
  originalJpeg: Uint8Array,
  dimensions: { width: number; height: number; sourceWidth: number; sourceHeight: number },
  settings: NativeImageSettings,
) => Promise<Uint8Array | NativeJpegTranscodeOutcome | null>;

/** Keep the URL, forms, signatures, tagged structure and archival rules
 * exactly as provided rather than modifying document-wide relationships. */
function protectStructure(pdf: PDFDocument): string | null {
  const inspection = inspectPdfStructure(pdf);
  if (inspection.safeForCompression) return null;
  return inspection.protectedFeatures.length
    ? "This PDF contains protected, interactive, navigational or archival structures; the original is retained."
    : "This PDF contains unsupported page geometry or resource structures; the original is retained.";
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function keepOriginal(bytes: ArrayBuffer, reason?: string): NativeOptimizationResult {
  return {
    bytes: bytes.slice(0),
    inputBytes: bytes.byteLength,
    outputBytes: bytes.byteLength,
    analyzedImages: 0,
    optimizedImages: 0,
    applied: false,
    protectedReason: reason,
  };
}

/**
 * An image-resource-first, browser-independent PDF optimisation core.
 *
 * - Lossless object-stream rewriting is evaluated before any lossy work.
 * - JPEG resource replacement happens at the EXISTING indirect reference,
 *   protecting aliases and page sharing instead of leaving dangling refs.
 * - Text, fonts, vector paths, page geometry and PDF operators are never
 *   rasterized or rewritten as photos.
 * - A recompressed image is used only when its REAL JPEG bytes are smaller.
 * - The final PDF is re-parsed; the original wins if it is smaller.
 *
 * A JPEG codec is injected: the browser Worker owns its canvas/wasm runtime,
 * while this document-graph logic runs with the same behaviour in Node tests.
 * Unsupported formats stay untouched.
 */
export async function optimizeNativePdfImages(
  originalBytes: ArrayBuffer,
  mode: NativeOptimizationMode,
  settings: NativeImageSettings,
  transcode?: JpegTranscoder,
  onProgress?: (progress: NativeCompressionProgress) => void,
): Promise<NativeOptimizationResult> {
  if (originalBytes.byteLength < 8 || originalBytes.byteLength > 80 * 1024 * 1024) {
    throw new Error("The selected PDF exceeds the safe local optimisation size.");
  }
  if (!Number.isFinite(settings.dpi) || settings.dpi < 48 || settings.dpi > 350 ||
      !Number.isFinite(settings.quality) || settings.quality < 0.2 || settings.quality > 1) {
    throw new Error("Invalid quality or resolution settings.");
  }
  const pdf = await PDFDocument.load(originalBytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const expectedPages = pdf.getPageCount();
  if (expectedPages < 1 || expectedPages > 600) {
    throw new Error("Document page count exceeds safe processing limits.");
  }
  const protectedReason = protectStructure(pdf);
  if (protectedReason) return keepOriginal(originalBytes, protectedReason);

  onProgress?.({ completed: 0, total: 1, stage: "inspect" });
  let bestBytes = originalBytes.slice(0);
  const lossless = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
  if (lossless.byteLength < bestBytes.byteLength) {
    await validatePdfOutput(lossless, expectedPages);
    bestBytes = asArrayBuffer(lossless);
  }

  if (mode === "lossless" || !transcode) {
    return {
      bytes: bestBytes,
      inputBytes: originalBytes.byteLength,
      outputBytes: bestBytes.byteLength,
      analyzedImages: 0,
      optimizedImages: 0,
      applied: bestBytes.byteLength < originalBytes.byteLength,
    };
  }

  // Collect distinct images before touching the indirect-object graph.
  const candidates = new Map<string, {
    ref: ReturnType<typeof findEmbeddedJpegs>[number]["ref"];
    bytes: Uint8Array;
    pageWidth: number;
    pageHeight: number;
  }>();
  for (const page of pdf.getPages()) {
    const box = page.getCropBox();
    for (const jpeg of findEmbeddedJpegs(page)) {
      if (!candidates.has(jpeg.ref.toString())) {
        candidates.set(jpeg.ref.toString(), {
          ref: jpeg.ref,
          bytes: jpeg.bytes,
          pageWidth: box.width,
          pageHeight: box.height,
        });
      }
    }
  }
  if (candidates.size > 256) {
    throw new Error("This PDF contains too many independent images for a safe browser optimisation pass.");
  }

  let completed = 0;
  let changed = 0;
  let hasFullFidelityEvidence = true;
  let lowestAcceptedFidelity = 1;
  const total = candidates.size;
  for (const candidate of candidates.values()) {
    const originalStream = pdf.context.lookup(candidate.ref);
    if (!(originalStream instanceof PDFRawStream)) continue;
    // The structural intelligence layer is the single authority for which
    // image dictionaries may be replaced by 8-bit DeviceRGB JPEG. All masks,
    // ICC/CMYK, custom colour mapping and metadata stay untouched.
    if (!isCanonicalRgbJpegResource(originalStream)) {
      completed += 1;
      onProgress?.({ completed, total, stage: "images" });
      continue;
    }
    const width = originalStream.dict.lookup(PDFName.of("Width"));
    const height = originalStream.dict.lookup(PDFName.of("Height"));
    if (!(width instanceof PDFNumber) || !(height instanceof PDFNumber)) continue;
    const target = planEmbeddedJpegResize(
      width.asNumber(), height.asNumber(),
      candidate.pageWidth, candidate.pageHeight, settings.dpi,
    );
    if (!target) continue;
    try {
      const transcodeResult = await transcode(candidate.bytes, {
        ...target, sourceWidth: width.asNumber(), sourceHeight: height.asNumber(),
      }, settings);
      const nextBytes = transcodeResult instanceof Uint8Array
        ? transcodeResult : transcodeResult?.bytes;
      if (!nextBytes || nextBytes.byteLength >= candidate.bytes.byteLength || nextBytes.byteLength < 32) continue;
      const measuredScore = transcodeResult && !(transcodeResult instanceof Uint8Array)
        ? transcodeResult.sampledFidelityScore : undefined;
      if (measuredScore !== undefined &&
          (!Number.isFinite(measuredScore) || measuredScore < 0 || measuredScore > 1)) continue;
      const image = await pdf.embedJpg(nextBytes);
      if (image.width !== target.width || image.height !== target.height) continue;
      await image.embed();
      const replacement = pdf.context.lookup(image.ref);
      if (!(replacement instanceof PDFRawStream)) continue;
      // Preserve every alias and any cross-page shared use of the original
      // XObject. Replacing a single entry and deleting an old ref can corrupt
      // documents with several resource names for the same image.
      pdf.context.assign(candidate.ref, replacement);
      pdf.context.delete(image.ref);
      changed += 1;
      if (measuredScore === undefined) {
        hasFullFidelityEvidence = false;
      } else {
        lowestAcceptedFidelity = Math.min(lowestAcceptedFidelity, measuredScore);
      }
    } catch {
      // This image was unsupported by the browser decoder or yielded a bad
      // JPEG: keep its existing PDF stream intact rather than breaking output.
    } finally {
      completed += 1;
      onProgress?.({ completed, total, stage: "images" });
    }
  }

  onProgress?.({ completed: total, total, stage: "validate" });
  let selectedImagePass = false;
  if (changed > 0) {
    const output = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
    if (output.byteLength < bestBytes.byteLength) {
      await validatePdfOutput(output, expectedPages);
      bestBytes = asArrayBuffer(output);
      selectedImagePass = true;
    }
  }
  return {
    bytes: bestBytes,
    inputBytes: originalBytes.byteLength,
    outputBytes: bestBytes.byteLength,
    analyzedImages: total,
    // Only claim image optimisation when the image-bearing output actually
    // won. A valid smaller lossless result can supersede a lossy candidate.
    optimizedImages: selectedImagePass ? changed : 0,
    sampledFidelityScore: selectedImagePass && hasFullFidelityEvidence
      ? lowestAcceptedFidelity : undefined,
    applied: bestBytes.byteLength < originalBytes.byteLength,
  };
}
