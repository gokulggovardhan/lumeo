// lib/pdf/embeddedImages.ts
//
// Finds JPEG image XObjects referenced by a page's /Resources /XObject
// dictionary, without touching or decoding pixel data -- that half needs a
// canvas (browser-only) and lives in recompressEmbeddedImages below. This
// half is pure pdf-lib object-graph traversal, so it's self-contained and
// Node-testable the same way lib/pdf/core's other modules are.
//
// Deliberately conservative: only DCTDecode (JPEG) XObjects are reported.
// Indexed/CCITT/JBIG2/JPX-encoded images, soft-masked images, and Form
// XObjects are left alone entirely -- recompressing those correctly needs
// color-space and mask handling this pass doesn't attempt, and silently
// mishandling an image is worse than leaving it uncompressed.

import { PDFArray, PDFDict, PDFName, PDFRawStream, PDFRef, type PDFPage } from "pdf-lib";

export type EmbeddedJpegXObject = {
  name: string;
  ref: PDFRef;
  bytes: Uint8Array;
};

function isDctDecodeFilter(filter: ReturnType<PDFDict["get"]>): boolean {
  if (filter === PDFName.of("DCTDecode")) return true;
  // A /Filter array with more than one entry means chained filters (e.g.
  // ASCII85Decode then DCTDecode) -- correctly re-chaining those on write
  // is more than this conservative pass attempts, so only a bare single
  // DCTDecode (array of exactly one) is treated as safe to recompress.
  if (filter instanceof PDFArray && filter.size() === 1) {
    return filter.lookupMaybe(0, PDFName) === PDFName.of("DCTDecode");
  }
  return false;
}

function isPlainDctDecodeJpeg(stream: PDFRawStream): boolean {
  const dict = stream.dict;
  const subtype = dict.lookupMaybe(PDFName.of("Subtype"), PDFName);
  if (!subtype || subtype !== PDFName.of("Image")) return false;
  if (!isDctDecodeFilter(dict.get(PDFName.of("Filter")))) return false;

  // A soft mask (transparency) or an indexed/DeviceN color space needs to be
  // preserved exactly alongside the recompressed pixel data -- skip rather
  // than risk losing it.
  if (dict.has(PDFName.of("SMask")) || dict.has(PDFName.of("Mask"))) return false;
  const colorSpace = dict.get(PDFName.of("ColorSpace"));
  if (colorSpace && colorSpace !== PDFName.of("DeviceRGB") && colorSpace !== PDFName.of("DeviceGray")) {
    return false;
  }

  return true;
}

// Returns every plain-JPEG image XObject directly referenced by this page's
// own Resources dictionary (not nested inside a Form XObject -- those are
// out of scope for this pass).
export function findEmbeddedJpegs(page: PDFPage): EmbeddedJpegXObject[] {
  const resources = page.node.Resources();
  if (!resources) return [];

  const xObjects = resources.lookupMaybe(PDFName.of("XObject"), PDFDict);
  if (!xObjects) return [];

  const found: EmbeddedJpegXObject[] = [];
  for (const [name, value] of xObjects.entries()) {
    if (!(value instanceof PDFRef)) continue;
    const resolved = page.node.context.lookup(value);
    if (!(resolved instanceof PDFRawStream)) continue;
    if (!isPlainDctDecodeJpeg(resolved)) continue;

    found.push({ name: name.decodeText(), ref: value, bytes: resolved.getContents() });
  }

  return found;
}
