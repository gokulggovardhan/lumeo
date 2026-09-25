import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFString,
  decodePDFRawStream,
  type PDFContext,
  type PDFDocument,
} from "pdf-lib";
import {
  resolveFont,
  type EmbeddedGlyphEvidence,
  type ResolvedFont,
} from "./fontEncoding.ts";
import { resolveFontMetrics, type FontMetrics } from "./fontMetrics.ts";
import {
  pickFallbackFont,
  readFallbackStyleHints,
  type FallbackFontFamily,
  type FallbackStyleHints,
} from "./fallbackFont.ts";
import { sha256Hex } from "./sha256.ts";
import {
  parseSfntGlyphCoverage,
  type SfntGlyphCoverage,
} from "./sfntCmap.ts";

const SUBSET_PREFIX = /^[A-Z]{6}\+/;
const BOLD_NAME = /bold|black|heavy|semib|demib?|ultra/i;
const ITALIC_NAME = /italic|oblique/i;
const FLAG_SYMBOLIC = 1 << 2;
const FLAG_NONSYMBOLIC = 1 << 5;

export type BrowserFontProgramFormat =
  | "truetype"
  | "opentype"
  | "type1"
  | "cff"
  | "unknown";

export type PdfFontWritingMode = "horizontal" | "vertical" | "unknown";

export type PdfCidSystemInfo = {
  registry: string | null;
  ordering: string | null;
  supplement: number | null;
};

export type PdfCidToGidMapIdentity = {
  kind: "name" | "stream" | "unknown";
  name: string | null;
  objectRef: string | null;
};

export type PdfFontResourceIdentity = {
  fontObjectRef: string | null;
  descriptorObjectRef: string | null;
  descendantObjectRef: string | null;
  fontProgramObjectRef: string | null;
  toUnicodeObjectRef: string | null;
  encodingObjectRef: string | null;
  descriptorFontName: string | null;
  descendantSubtype: string | null;
  descendantBaseFont: string | null;
  type0Encoding: string | null;
  writingMode: PdfFontWritingMode;
  cidSystemInfo: PdfCidSystemInfo | null;
  cidToGidMap: PdfCidToGidMapIdentity | null;
};

export type EmbeddedFontProgram = {
  bytes: Uint8Array;
  format: BrowserFontProgramFormat;
  browserLoadable: boolean;
  objectRef: string | null;
  sha256: string;
};

export type PdfFontProfile = {
  resourceName: string;
  kind: ResolvedFont["kind"];
  baseFont: string;
  familyName: string;
  isEmbedded: boolean;
  isSubset: boolean;
  encodingSource: ResolvedFont["encodingSource"];
  metricsSource: FontMetrics["source"];
  bytesPerCode: 1 | 2;
  weight: number;
  italic: boolean;
  serif: boolean;
  monospace: boolean;
  descriptorFlags: number | null;
  italicAngle: number | null;
  /** FontDescriptor vertical metrics normalized to one em when available. */
  ascentRatio: number | null;
  descentRatio: number | null;
  capHeightRatio: number | null;
  /**
   * PDF FontDescriptor /FSType when the producer supplied it. Null means
   * embedding permission cannot be proven and consumers must not assume the
   * embedded PDF font program may be redistributed inside another document.
   */
  fsType: number | null;
  fallbackPdfFont: FallbackFontFamily;
  cssFallbackFamily: string;
  browserFamilyName: string;
  browserPreviewPossible: boolean;
  resourceIdentity: PdfFontResourceIdentity;
  embeddedProgramByteLength: number | null;
  embeddedProgramSha256: string | null;
  embeddedGlyphCoverage: SfntGlyphCoverage | null;
  embeddedGlyphEvidence: EmbeddedGlyphEvidence | null;
  resolvedFont: ResolvedFont;
  metrics: FontMetrics;
  styleHints: FallbackStyleHints;
};

function nameString(value: unknown): string | null {
  return value instanceof PDFName ? value.asString().replace(/^\//, "") : null;
}

function numberValue(value: unknown): number | null {
  return value instanceof PDFNumber ? value.asNumber() : null;
}

function textStringValue(value: unknown): string | null {
  if (value instanceof PDFString || value instanceof PDFHexString) {
    try {
      return value.decodeText();
    } catch {
      return null;
    }
  }
  // CIDSystemInfo is specified as PDF strings, but accepting a name here
  // makes diagnostics robust to real-world producers that serialize these
  // identifiers non-canonically.
  return nameString(value);
}

function refString(value: unknown): string | null {
  return value instanceof PDFRef ? value.toString() : null;
}

function normalizedDescriptorMetric(
  descriptor: PDFDict | null,
  name: string,
): number | null {
  if (!descriptor) return null;
  const value = numberValue(descriptor.get(PDFName.of(name)));
  if (value === null || !Number.isFinite(value)) return null;
  // FontDescriptor metrics use the standard 1000-unit glyph space for the
  // font types handled here. Keep only sane values so malformed PDFs cannot
  // produce absurd Word frame geometry.
  const ratio = value / 1000;
  return Math.abs(ratio) <= 2 ? ratio : null;
}

function resolveObject(value: unknown, context: PDFContext): unknown {
  return value instanceof PDFRef ? context.lookup(value) : value;
}

function resolveDict(value: unknown, context: PDFContext): PDFDict | null {
  const resolved = resolveObject(value, context);
  return resolved instanceof PDFDict ? resolved : null;
}

function resolveArray(value: unknown, context: PDFContext): PDFArray | null {
  const resolved = resolveObject(value, context);
  return resolved instanceof PDFArray ? resolved : null;
}

type FontStructure = {
  descriptor: PDFDict | null;
  descriptorRef: string | null;
  descendant: PDFDict | null;
  descendantRef: string | null;
};

function structureForFont(fontDict: PDFDict, context: PDFContext): FontStructure {
  const subtype = nameString(fontDict.get(PDFName.of("Subtype")));
  let descriptorHost: PDFDict | null = fontDict;
  let descendant: PDFDict | null = null;
  let descendantRef: string | null = null;

  if (subtype === "Type0") {
    const descendants = resolveArray(fontDict.get(PDFName.of("DescendantFonts")), context);
    const descendantEntry = descendants && descendants.size() > 0 ? descendants.get(0) : null;
    descendantRef = refString(descendantEntry);
    descendant = descendantEntry ? resolveDict(descendantEntry, context) : null;
    descriptorHost = descendant;
  }

  const descriptorEntry = descriptorHost?.get(PDFName.of("FontDescriptor")) ?? null;
  return {
    descriptor: descriptorEntry ? resolveDict(descriptorEntry, context) : null,
    descriptorRef: refString(descriptorEntry),
    descendant,
    descendantRef,
  };
}

function descriptorForFont(fontDict: PDFDict, context: PDFContext): PDFDict | null {
  return structureForFont(fontDict, context).descriptor;
}

function familyNameFromBaseFont(baseFont: string): string {
  const withoutSubset = baseFont.replace(SUBSET_PREFIX, "");
  return withoutSubset
    .replace(/,(?:Bold|Italic|Oblique|Regular).*$/i, "")
    .replace(/-(?:BoldItalic|BoldOblique|Bold|Italic|Oblique|Roman|Regular).*$/i, "")
    .replace(/PSMT$/i, "")
    .replace(/MT$/i, "")
    .trim() || "PDF font";
}

function safeFamilyToken(value: string): string {
  const token = value.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return token.slice(0, 48) || "Font";
}

function fallbackCssStack(fallback: FallbackFontFamily): string {
  if (fallback.startsWith("Times")) {
    return '"Times New Roman", Times, serif';
  }
  if (fallback.startsWith("Courier")) {
    return '"Courier New", Courier, monospace';
  }
  return 'Arial, Helvetica, sans-serif';
}

function programFormatFor(
  descriptor: PDFDict,
  context: PDFContext,
): {
  entry: unknown;
  format: BrowserFontProgramFormat;
  browserLoadable: boolean;
} | null {
  const trueType = descriptor.get(PDFName.of("FontFile2"));
  if (trueType) return { entry: trueType, format: "truetype", browserLoadable: true };

  const fontFile3 = descriptor.get(PDFName.of("FontFile3"));
  if (fontFile3) {
    const resolved = resolveObject(fontFile3, context);
    if (resolved instanceof PDFRawStream) {
      const subtype = nameString(resolved.dict.get(PDFName.of("Subtype")));
      if (subtype === "OpenType") {
        return { entry: fontFile3, format: "opentype", browserLoadable: true };
      }
      if (subtype === "Type1C" || subtype === "CIDFontType0C") {
        return { entry: fontFile3, format: "cff", browserLoadable: false };
      }
    }
    return { entry: fontFile3, format: "unknown", browserLoadable: false };
  }

  const type1 = descriptor.get(PDFName.of("FontFile"));
  if (type1) return { entry: type1, format: "type1", browserLoadable: false };
  return null;
}

function readEmbeddedProgram(fontDict: PDFDict, context: PDFContext): EmbeddedFontProgram | null {
  const descriptor = descriptorForFont(fontDict, context);
  if (!descriptor) return null;
  const candidate = programFormatFor(descriptor, context);
  if (!candidate) return null;

  const resolved = resolveObject(candidate.entry, context);
  if (!(resolved instanceof PDFRawStream)) return null;

  try {
    const bytes = decodePDFRawStream(resolved).decode();
    return {
      bytes,
      format: candidate.format,
      browserLoadable: candidate.browserLoadable && bytes.byteLength > 0,
      objectRef: refString(candidate.entry),
      sha256: sha256Hex(bytes),
    };
  } catch {
    return null;
  }
}

type ResolvedFontResource = {
  dict: PDFDict;
  objectRef: string | null;
};

function resolveFontResource(
  resources: PDFDict,
  resourceName: string,
  context: PDFContext,
): ResolvedFontResource | null {
  const fonts = resolveDict(resources.get(PDFName.of("Font")), context);
  if (!fonts) return null;
  const entry = fonts.get(PDFName.of(resourceName));
  const dict = resolveDict(entry, context);
  return dict ? { dict, objectRef: refString(entry) } : null;
}

function resolveFontDict(
  resources: PDFDict,
  resourceName: string,
  context: PDFContext,
): PDFDict | null {
  return resolveFontResource(resources, resourceName, context)?.dict ?? null;
}

function writingModeForEncoding(name: string | null): PdfFontWritingMode {
  if (!name) return "unknown";
  if (/(?:^|-)V$/i.test(name)) return "vertical";
  if (/(?:^|-)H$/i.test(name) || /^Identity-H$/i.test(name)) return "horizontal";
  return "unknown";
}

function cidSystemInfoFor(descendant: PDFDict | null, context: PDFContext): PdfCidSystemInfo | null {
  if (!descendant) return null;
  const value = descendant.get(PDFName.of("CIDSystemInfo"));
  const info = resolveDict(value, context);
  if (!info) return null;
  return {
    registry: textStringValue(resolveObject(info.get(PDFName.of("Registry")), context)),
    ordering: textStringValue(resolveObject(info.get(PDFName.of("Ordering")), context)),
    supplement: numberValue(resolveObject(info.get(PDFName.of("Supplement")), context)),
  };
}

function cidToGidMapFor(
  descendant: PDFDict | null,
  context: PDFContext,
): PdfCidToGidMapIdentity | null {
  if (!descendant) return null;
  const entry = descendant.get(PDFName.of("CIDToGIDMap"));
  if (!entry) return null;
  const resolved = resolveObject(entry, context);
  const name = nameString(resolved);
  if (name) return { kind: "name", name, objectRef: refString(entry) };
  if (resolved instanceof PDFRawStream) {
    return { kind: "stream", name: null, objectRef: refString(entry) };
  }
  return { kind: "unknown", name: null, objectRef: refString(entry) };
}

function resourceIdentityFor(
  fontResource: ResolvedFontResource,
  context: PDFContext,
  embeddedProgram: EmbeddedFontProgram | null,
): PdfFontResourceIdentity {
  const fontDict = fontResource.dict;
  const structure = structureForFont(fontDict, context);
  const encodingEntry = fontDict.get(PDFName.of("Encoding"));
  const type0Encoding = nameString(resolveObject(encodingEntry, context));
  const toUnicodeEntry = fontDict.get(PDFName.of("ToUnicode"));
  const descriptorFontName = structure.descriptor
    ? nameString(structure.descriptor.get(PDFName.of("FontName")))
    : null;
  const descendantSubtype = structure.descendant
    ? nameString(structure.descendant.get(PDFName.of("Subtype")))
    : null;
  const descendantBaseFont = structure.descendant
    ? nameString(structure.descendant.get(PDFName.of("BaseFont")))
    : null;

  return {
    fontObjectRef: fontResource.objectRef,
    descriptorObjectRef: structure.descriptorRef,
    descendantObjectRef: structure.descendantRef,
    fontProgramObjectRef: embeddedProgram?.objectRef ?? null,
    toUnicodeObjectRef: refString(toUnicodeEntry),
    encodingObjectRef: refString(encodingEntry),
    descriptorFontName,
    descendantSubtype,
    descendantBaseFont,
    type0Encoding,
    writingMode: writingModeForEncoding(type0Encoding),
    cidSystemInfo: cidSystemInfoFor(structure.descendant, context),
    cidToGidMap: cidToGidMapFor(structure.descendant, context),
  };
}

/**
 * Per-document font resolver/cache.
 *
 * Font parsing is intentionally centralized here instead of repeated by
 * React selection logic. The registry never guesses that an embedded subset
 * can render a new glyph: fontEncoding.ts remains the authority for safe
 * write-back. Browser FontFace loading is preview-only and best effort.
 */
export class PdfFontRegistry {
  private readonly profileCache = new WeakMap<PDFDict, PdfFontProfile>();
  private readonly programCache = new WeakMap<PDFDict, EmbeddedFontProgram | null>();
  private readonly browserFaceCache = new WeakMap<PDFDict, Promise<string | null>>();
  private readonly context: PDFContext;

  constructor(document: PDFDocument) {
    this.context = document.context;
  }

  resolve(resources: PDFDict, resourceName: string): PdfFontProfile | null {
    const fontResource = resolveFontResource(resources, resourceName, this.context);
    if (!fontResource) return null;
    const fontDict = fontResource.dict;

    const cached = this.profileCache.get(fontDict);
    if (cached) return cached;

    const resolvedFont = resolveFont(fontDict, this.context);
    const metrics = resolveFontMetrics(fontDict, this.context, resolvedFont);
    const styleHints = readFallbackStyleHints(fontDict, this.context);
    const descriptor = descriptorForFont(fontDict, this.context);
    const fallbackPdfFont = pickFallbackFont(styleHints);
    const familyName = familyNameFromBaseFont(resolvedFont.baseFont);
    const weight =
      styleHints.fontWeight ??
      (BOLD_NAME.test(resolvedFont.baseFont) || fallbackPdfFont.includes("Bold")
        ? 700
        : 400);
    const italic =
      ITALIC_NAME.test(resolvedFont.baseFont) ||
      (styleHints.italicAngle !== null && styleHints.italicAngle !== 0) ||
      fallbackPdfFont.includes("Italic") ||
      fallbackPdfFont.includes("Oblique");
    const serif = fallbackPdfFont.startsWith("Times");
    const monospace = fallbackPdfFont.startsWith("Courier");
    const embeddedProgram = this.embeddedProgramFor(fontDict);
    const embeddedGlyphCoverage =
      embeddedProgram &&
      (embeddedProgram.format === "truetype" || embeddedProgram.format === "opentype")
        ? parseSfntGlyphCoverage(embeddedProgram.bytes)
        : null;
    const descriptorFlags = styleHints.flags;
    const embeddedGlyphEvidence: EmbeddedGlyphEvidence | null =
      embeddedGlyphCoverage && resolvedFont.kind === "TrueType"
        ? {
            // PDF symbolic TrueType fonts use producer-specific code->glyph
            // conventions; a Unicode cmap alone is not enough proof there.
            // Require explicit nonsymbolic evidence and no Symbolic flag.
            safeForSimplePdfEncoding:
              descriptorFlags !== null &&
              (descriptorFlags & FLAG_NONSYMBOLIC) !== 0 &&
              (descriptorFlags & FLAG_SYMBOLIC) === 0,
            hasUnicodeCodePoint: embeddedGlyphCoverage.hasCodePoint,
          }
        : null;

    const profile: PdfFontProfile = {
      resourceName,
      kind: resolvedFont.kind,
      baseFont: resolvedFont.baseFont,
      familyName,
      isEmbedded: resolvedFont.isEmbedded,
      isSubset: resolvedFont.isSubset,
      encodingSource: resolvedFont.encodingSource,
      metricsSource: metrics.source,
      bytesPerCode: resolvedFont.bytesPerCode,
      weight,
      italic,
      serif,
      monospace,
      descriptorFlags: styleHints.flags,
      italicAngle: styleHints.italicAngle,
      ascentRatio: normalizedDescriptorMetric(descriptor, "Ascent"),
      descentRatio: normalizedDescriptorMetric(descriptor, "Descent"),
      capHeightRatio: normalizedDescriptorMetric(descriptor, "CapHeight"),
      fsType: descriptor ? numberValue(descriptor.get(PDFName.of("FSType"))) : null,
      fallbackPdfFont,
      cssFallbackFamily: fallbackCssStack(fallbackPdfFont),
      browserFamilyName: `LumeoPdf_${safeFamilyToken(resourceName)}_${safeFamilyToken(resolvedFont.baseFont)}`,
      browserPreviewPossible: Boolean(embeddedProgram?.browserLoadable),
      resourceIdentity: resourceIdentityFor(fontResource, this.context, embeddedProgram),
      embeddedProgramByteLength: embeddedProgram?.bytes.byteLength ?? null,
      embeddedProgramSha256: embeddedProgram?.sha256 ?? null,
      embeddedGlyphCoverage,
      embeddedGlyphEvidence,
      resolvedFont,
      metrics,
      styleHints,
    };
    this.profileCache.set(fontDict, profile);
    return profile;
  }

  embeddedProgram(resources: PDFDict, resourceName: string): EmbeddedFontProgram | null {
    const fontDict = resolveFontDict(resources, resourceName, this.context);
    return fontDict ? this.embeddedProgramFor(fontDict) : null;
  }

  private embeddedProgramFor(fontDict: PDFDict): EmbeddedFontProgram | null {
    if (this.programCache.has(fontDict)) {
      return this.programCache.get(fontDict) ?? null;
    }
    const program = readEmbeddedProgram(fontDict, this.context);
    this.programCache.set(fontDict, program);
    return program;
  }

  /**
   * Registers a browser-compatible embedded font for editing preview.
   * Returns the unique FontFace family when successful, otherwise null.
   * This never changes export/write-back decisions.
   */
  ensureBrowserFont(resources: PDFDict, resourceName: string): Promise<string | null> {
    const fontDict = resolveFontDict(resources, resourceName, this.context);
    if (!fontDict) return Promise.resolve(null);

    const cached = this.browserFaceCache.get(fontDict);
    if (cached) return cached;

    const profile = this.resolve(resources, resourceName);
    const program = this.embeddedProgramFor(fontDict);
    const promise = (async () => {
      if (!profile || !program?.browserLoadable) return null;
      if (
        typeof FontFace === "undefined" ||
        typeof document === "undefined" ||
        !document.fonts
      ) {
        return null;
      }

      try {
        const bytes = program.bytes.slice().buffer as ArrayBuffer;
        const face = new FontFace(profile.browserFamilyName, bytes, {
          weight: String(profile.weight),
          style: profile.italic ? "italic" : "normal",
        });
        const loaded = await face.load();
        document.fonts.add(loaded);
        return profile.browserFamilyName;
      } catch {
        // Embedded PDF subsets commonly omit browser-facing cmap metadata.
        // A failed preview registration is expected and must never make the
        // underlying PDF text uneditable.
        return null;
      }
    })();

    this.browserFaceCache.set(fontDict, promise);
    return promise;
  }
}
