import type { PdfFontProfile } from "./fontRegistry.ts";

export type FontPreviewFidelityKind =
  | "exact-embedded"
  | "verified-equivalent"
  | "fallback";

export type FontPreviewFidelity = {
  kind: FontPreviewFidelityKind;
  label: string;
  detail: string;
};

export type VerifiedEquivalentFontPreviewEvidence = Readonly<{
  familyName: string;
  fontIdentityVerified: true;
  glyphMetricsVerified: true;
}>;

type FontPreviewFidelityInput = {
  profile: Pick<PdfFontProfile, "isEmbedded" | "embeddedProgramSha256"> | null;
  loadedEmbeddedProgramSha256: string | null;
  verifiedEquivalent: VerifiedEquivalentFontPreviewEvidence | null;
};

const VISUAL_ONLY_NOTE =
  "Preview fidelity is visual only and never authorizes or blocks a native PDF edit.";

function normalizedSha256(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

/**
 * Describes how faithfully the browser can preview the selected PDF font.
 *
 * This is intentionally separate from text edit authorization:
 * - exact-embedded requires proof that FontFace loaded the same embedded
 *   program fingerprint recorded by PdfFontRegistry;
 * - verified-equivalent requires an independent caller to prove both font
 *   identity and glyph metrics;
 * - every other path is an honest browser fallback.
 *
 * None of these states participate in writer authority, glyph authorization,
 * geometry reconciliation, or post-export verification.
 */
export function describeFontPreviewFidelity({
  profile,
  loadedEmbeddedProgramSha256,
  verifiedEquivalent,
}: FontPreviewFidelityInput): FontPreviewFidelity {
  const expectedEmbeddedSha = normalizedSha256(profile?.embeddedProgramSha256);
  const loadedEmbeddedSha = normalizedSha256(loadedEmbeddedProgramSha256);

  if (
    profile?.isEmbedded &&
    expectedEmbeddedSha &&
    loadedEmbeddedSha === expectedEmbeddedSha
  ) {
    return {
      kind: "exact-embedded",
      label: "Preview: Exact embedded font",
      detail:
        "The browser loaded the same embedded font program stored in this PDF. " +
        VISUAL_ONLY_NOTE,
    };
  }

  if (
    verifiedEquivalent?.familyName.trim() &&
    verifiedEquivalent.fontIdentityVerified === true &&
    verifiedEquivalent.glyphMetricsVerified === true
  ) {
    return {
      kind: "verified-equivalent",
      label: "Preview: Verified equivalent",
      detail:
        `The browser is using ${verifiedEquivalent.familyName.trim()}, independently verified against the PDF font identity and glyph metrics. ${VISUAL_ONLY_NOTE}`,
    };
  }

  return {
    kind: "fallback",
    label: "Preview: Fallback font",
    detail:
      "The browser is using a substitute font for the editing preview, so its appearance may differ slightly from the PDF. " +
      VISUAL_ONLY_NOTE,
  };
}
