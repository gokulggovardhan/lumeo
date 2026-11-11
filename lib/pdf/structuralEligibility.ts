import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  type PDFContext,
} from "pdf-lib";

/**
 * Phase 3 — browser-local, read-only structural eligibility inspection.
 *
 * This is a conservative preflight for both native Merge and native Compress.
 * Unsupported structures are reported, never deleted or converted. The
 * report records structure categories only, not PDF text or file contents.
 *
 * JPEG resource eligibility is separate from DOCUMENT eligibility: a PDF
 * containing CMYK, masks, ICC profiles, JBIG2 or a Form XObject may still be
 * merged natively or losslessly serialized, while those individual image
 * resources are NOT eligible for RGB JPEG transcoding.
 */
export type PdfPageBox = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;
export type PdfPageStructure = Readonly<{
  index: number;
  mediaBox: PdfPageBox | null;
  cropBox: PdfPageBox | null;
  rotation: number | null;
  annotationCount: number;
  fontResources: number;
  imageResources: number;
  formXObjects: number;
}>;
export type PdfImageStructure = Readonly<{
  objectRef: string;
  encoding: string;
  colorSpace: string;
  masked: boolean;
  isCanonicalRgbJpeg: boolean;
}>;
export type PdfStructureInspection = Readonly<{
  safeForMerge: boolean;
  safeForCompression: boolean;
  protectedFeatures: readonly string[];
  unsupportedReasons: readonly string[];
  pages: readonly PdfPageStructure[];
  images: readonly PdfImageStructure[];
  totalFontResources: number;
  totalFormXObjects: number;
}>;

const PROTECTED_CATALOG_FEATURES = [
  "Perms", "AcroForm", "Outlines", "Names", "AF", "StructTreeRoot",
  "OutputIntents", "Collection", "OpenAction", "AA", "OCProperties",
] as const;
const MAX_RESOURCES = 4096;
const MAX_FORM_DEPTH = 8;

function nameOf(value: unknown): string | null {
  return value instanceof PDFName ? value.asString().replace(/^\//, "") : null;
}

function resolve(value: unknown, context: PDFContext): unknown {
  if (!(value instanceof PDFRef)) return value;
  try {
    return context.lookup(value);
  } catch {
    return null;
  }
}

function asDict(value: unknown, context: PDFContext): PDFDict | null {
  const found = resolve(value, context);
  return found instanceof PDFDict ? found : null;
}

function finiteBox(box: PdfPageBox | null): box is PdfPageBox {
  return Boolean(box &&
    [box.x, box.y, box.width, box.height].every(Number.isFinite) &&
    box.width > 0 && box.height > 0);
}

function filterName(value: unknown, context: PDFContext): string {
  const direct = resolve(value, context);
  if (direct instanceof PDFName) return nameOf(direct) ?? "Unknown";
  if (direct instanceof PDFArray) {
    try {
      return direct.asArray().map((item) => nameOf(resolve(item, context)) ?? "Unknown").join("+");
    } catch {
      return "Unknown";
    }
  }
  return "Unknown";
}

function imageIsCanonicalRgbJpeg(stream: PDFRawStream, context: PDFContext): boolean {
  const dict = stream.dict;
  const keys = new Set([
    "Type", "Subtype", "Width", "Height", "ColorSpace",
    "BitsPerComponent", "Length", "Filter",
  ]);
  if (dict.keys().some((key) => !keys.has(key.decodeText()))) return false;
  if (nameOf(resolve(dict.get(PDFName.of("Subtype")), context)) !== "Image") return false;
  if (filterName(dict.get(PDFName.of("Filter")), context) !== "DCTDecode") return false;
  if (nameOf(resolve(dict.get(PDFName.of("ColorSpace")), context)) !== "DeviceRGB") return false;
  const depth = resolve(dict.get(PDFName.of("BitsPerComponent")), context);
  const width = resolve(dict.get(PDFName.of("Width")), context);
  const height = resolve(dict.get(PDFName.of("Height")), context);
  return depth instanceof PDFNumber && depth.asNumber() === 8 &&
    width instanceof PDFNumber && height instanceof PDFNumber &&
    Number.isSafeInteger(width.asNumber()) && width.asNumber() > 0 &&
    Number.isSafeInteger(height.asNumber()) && height.asNumber() > 0 &&
    width.asNumber() * height.asNumber() <= 24_000_000;
}

/** The one canonical RGB JPEG eligibility proof shared by classification and the compressor. */
export function isCanonicalRgbJpegResource(stream: PDFRawStream): boolean {
  return imageIsCanonicalRgbJpeg(stream, stream.dict.context);
}

type MutablePageInfo = {
  index: number;
  mediaBox: PdfPageBox | null;
  cropBox: PdfPageBox | null;
  rotation: number | null;
  annotationCount: number;
  fontResources: number;
  imageResources: number;
  formXObjects: number;
};

/**
 * An invalid resource reference, runaway nested Form graph, bad page box or
 * protected document-level action fails closed. Otherwise *individual*
 * unsupported image encodings/colour profiles remain untouched.
 */
export function inspectPdfStructure(pdf: PDFDocument): PdfStructureInspection {
  const context = pdf.context;
  const protectedFeatures = new Set<string>();
  const unsafe = new Set<string>();
  const images = new Map<string, PdfImageStructure>();
  const seenForms = new Set<string>();
  let totalFontResources = 0;
  let totalFormXObjects = 0;
  let visitedResources = 0;

  for (const feature of PROTECTED_CATALOG_FEATURES) {
    if (pdf.catalog.has(PDFName.of(feature))) protectedFeatures.add(feature);
  }

  function visitResources(
    resources: PDFDict | null,
    page: MutablePageInfo,
    depth: number,
  ): void {
    if (!resources) return;
    if (depth > MAX_FORM_DEPTH || ++visitedResources > MAX_RESOURCES) {
      unsafe.add("PDF resource nesting exceeds the bounded safe inspection limit.");
      return;
    }

    const fontValue = resources.get(PDFName.of("Font"));
    if (fontValue) {
      const fonts = asDict(fontValue, context);
      if (!fonts) unsafe.add("PDF font resource dictionary could not be resolved.");
      else {
        page.fontResources += fonts.size();
        totalFontResources += fonts.size();
        for (const [, entry] of fonts.entries()) {
          if (!asDict(entry, context)) unsafe.add("A PDF font resource reference is malformed.");
        }
      }
    }

    const xObjectValue = resources.get(PDFName.of("XObject"));
    if (!xObjectValue) return;
    const xObjects = asDict(xObjectValue, context);
    if (!xObjects) {
      unsafe.add("PDF XObject resource dictionary could not be resolved.");
      return;
    }

    for (const [, entry] of xObjects.entries()) {
      if (++visitedResources > MAX_RESOURCES) {
        unsafe.add("PDF resource count exceeds the bounded safe inspection limit.");
        return;
      }
      if (!(entry instanceof PDFRef)) {
        unsafe.add("A PDF XObject has no stable indirect reference.");
        continue;
      }
      const objectRef = entry.toString();
      const stream = resolve(entry, context);
      if (!(stream instanceof PDFRawStream)) {
        unsafe.add("A PDF XObject resource reference is invalid.");
        continue;
      }
      const kind = nameOf(resolve(stream.dict.get(PDFName.of("Subtype")), context));
      if (kind === "Image") {
        page.imageResources += 1;
        if (images.has(objectRef)) continue;
        const encoding = filterName(stream.dict.get(PDFName.of("Filter")), context);
        const colorSpace = nameOf(resolve(stream.dict.get(PDFName.of("ColorSpace")), context)) ?? "Complex/unknown";
        images.set(objectRef, {
          objectRef, encoding, colorSpace,
          masked: stream.dict.has(PDFName.of("Mask")) || stream.dict.has(PDFName.of("SMask")),
          isCanonicalRgbJpeg: isCanonicalRgbJpegResource(stream),
        });
      } else if (kind === "Form") {
        page.formXObjects += 1;
        if (seenForms.has(objectRef)) continue;
        seenForms.add(objectRef);
        totalFormXObjects += 1;
        const nested = stream.dict.get(PDFName.of("Resources"));
        // A Form can inherit page resources when no local Resources exist.
        if (nested) visitResources(asDict(nested, context), page, depth + 1);
      } else {
        // Do not guess how PostScript, image alternates, or unknown XObject
        // programs should be serialized or preserved under an embedding.
        unsafe.add("A PDF XObject has an unsupported subtype.");
      }
    }
  }

  const pages: PdfPageStructure[] = [];
  for (const [index, page] of pdf.getPages().entries()) {
    const info: MutablePageInfo = {
      index, mediaBox: null, cropBox: null, rotation: null,
      annotationCount: 0, fontResources: 0, imageResources: 0,
      formXObjects: 0,
    };
    try {
      info.mediaBox = page.getMediaBox();
      info.cropBox = page.getCropBox();
      info.rotation = page.getRotation().angle;
      if (!finiteBox(info.mediaBox) || !finiteBox(info.cropBox)) {
        unsafe.add("A PDF page has an invalid MediaBox or CropBox.");
      }
      if (info.rotation === null || !Number.isInteger(info.rotation) || info.rotation % 90 !== 0) {
        unsafe.add("A PDF page has an unsupported rotation.");
      }
      const annots = page.node.Annots();
      info.annotationCount = annots?.size() ?? 0;
      if (info.annotationCount > 0) protectedFeatures.add("PageAnnotations");
      visitResources(page.node.Resources() ?? null, info, 0);
    } catch {
      unsafe.add("A PDF page could not be inspected safely.");
    }
    pages.push(info);
  }

  if (pages.length === 0) unsafe.add("The document contains no pages.");
  const safe = protectedFeatures.size === 0 && unsafe.size === 0;

  return {
    safeForMerge: safe,
    safeForCompression: safe,
    protectedFeatures: [...protectedFeatures].sort(),
    unsupportedReasons: [...unsafe].sort(),
    pages,
    images: [...images.values()],
    totalFontResources,
    totalFormXObjects,
  };
}
