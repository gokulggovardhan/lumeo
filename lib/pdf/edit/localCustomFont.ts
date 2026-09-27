import {
  inspectPdfFontProgram,
  type PdfFontProgramInspection,
  type PdfFontProgramIntelligence,
} from "./fontProgramIntelligence.ts";
import { sha256Hex } from "./sha256.ts";

export const MAX_LOCAL_CUSTOM_FONT_BYTES = 16 * 1024 * 1024;
export const MAX_LOCAL_CUSTOM_FONT_SESSION_BYTES = 32 * 1024 * 1024;

export type LocalCustomFontDescriptor = Readonly<{
  id: string;
  fileName: string;
  familyName: string;
  fullName: string | null;
  postScriptName: string | null;
  byteLength: number;
  sha256: string;
  browserFamilyName: string;
}>;

export type LocalCustomFontAsset = Readonly<{
  descriptor: LocalCustomFontDescriptor;
  bytes: Uint8Array;
  intelligence: PdfFontProgramIntelligence;
}>;

export type LocalCustomFontAssetResult =
  | Readonly<{ kind: "ready"; asset: LocalCustomFontAsset }>
  | Readonly<{ kind: "blocked"; reason: string }>;

type LocalFontInspector = (
  bytes: Uint8Array,
) => Promise<PdfFontProgramInspection>;

function cleanLabel(value: string | null | undefined): string | null {
  const cleaned = typeof value === "string" ? value.trim() : "";
  return cleaned || null;
}

function fileStem(fileName: string): string {
  const cleaned = fileName.trim().replace(/\.(?:ttf|otf)$/i, "").trim();
  return cleaned || "Local font";
}

export async function createLocalCustomFontAsset(
  bytes: Uint8Array,
  fileName: string,
  {
    inspectFont = (input) =>
      inspectPdfFontProgram(input, { maxBytes: MAX_LOCAL_CUSTOM_FONT_BYTES }),
  }: { inspectFont?: LocalFontInspector } = {},
): Promise<LocalCustomFontAssetResult> {
  const normalizedFileName = fileName.trim();
  if (!/\.(?:ttf|otf)$/i.test(normalizedFileName)) {
    return {
      kind: "blocked",
      reason: "Choose a .ttf or .otf font file.",
    };
  }

  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    return { kind: "blocked", reason: "Choose a non-empty TrueType or OpenType font file." };
  }
  if (bytes.byteLength > MAX_LOCAL_CUSTOM_FONT_BYTES) {
    return {
      kind: "blocked",
      reason: "This font is larger than Lumeo's 16 MB local-font safety limit.",
    };
  }

  const inspection = await inspectFont(bytes);
  if (inspection.kind !== "ok") {
    return {
      kind: "blocked",
      reason:
        inspection.reason ||
        "This font could not be inspected safely in the browser.",
    };
  }

  const sha256 = sha256Hex(bytes);
  const metadata = inspection.intelligence.metadata;
  const familyName =
    cleanLabel(metadata.familyName) ??
    cleanLabel(metadata.fullName) ??
    cleanLabel(metadata.postScriptName) ??
    fileStem(fileName);

  return {
    kind: "ready",
    asset: {
      descriptor: {
        id: `local-font-${sha256}`,
        fileName: fileName.trim() || "local-font",
        familyName,
        fullName: cleanLabel(metadata.fullName),
        postScriptName: cleanLabel(metadata.postScriptName),
        byteLength: bytes.byteLength,
        sha256,
        browserFamilyName: `LumeoLocal_${sha256.slice(0, 16)}`,
      },
      bytes: bytes.slice(),
      intelligence: inspection.intelligence,
    },
  };
}

export function firstUnsupportedLocalCustomFontCharacter(
  asset: Pick<LocalCustomFontAsset, "intelligence">,
  text: string,
): string | null {
  for (const char of text) {
    if (char === "\n" || char === "\r") continue;
    if (!asset.intelligence.hasGlyphForCodePoint(char.codePointAt(0)!)) {
      return char;
    }
  }
  return null;
}

export function localCustomFontTextIssue(
  asset: Pick<LocalCustomFontAsset, "intelligence" | "descriptor">,
  text: string,
): string | null {
  const unsupported = firstUnsupportedLocalCustomFontCharacter(asset, text);
  if (unsupported === null) return null;
  const printable =
    unsupported === "\t"
      ? "a tab character"
      : `“${unsupported}” (U+${unsupported
          .codePointAt(0)!
          .toString(16)
          .toUpperCase()
          .padStart(4, "0")})`;
  return `${asset.descriptor.familyName} does not contain ${printable}. Choose another font or change the text before exporting.`;
}

export async function loadLocalCustomFontFace(
  asset: LocalCustomFontAsset,
): Promise<FontFace | null> {
  if (
    typeof document === "undefined" ||
    typeof FontFace === "undefined"
  ) {
    return null;
  }

  const source = asset.bytes.slice().buffer as ArrayBuffer;
  const face = new FontFace(asset.descriptor.browserFamilyName, source);
  const loaded = await face.load();
  document.fonts.add(loaded);
  return loaded;
}

export function removeLocalCustomFontFace(face: FontFace | null | undefined): void {
  if (!face || typeof document === "undefined") return;
  try {
    document.fonts.delete(face);
  } catch {
    // Best-effort browser cleanup only. Export never depends on FontFace.
  }
}
