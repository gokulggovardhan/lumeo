import type { PdfFontProfile } from "./fontRegistry.ts";

export type FontPreviewFidelityKind =
  | "exact-embedded"
  | "verified-equivalent"
  | "fallback";

export type VerifiedEquivalentFontPreview = {
  family: string;
  evidence: string;
};

export type FontPreviewFidelity = {
  kind: FontPreviewFidelityKind;
  label: string;
  detail: string;
  family: string | null;
};

type PreviewProfile = Pick<
  PdfFontProfile,
  | "isEmbedded"
  | "browserPreviewPossible"
  | "cssFallbackFamily"
  | "familyName"
  | "embeddedProgramSha256"
>;

function normalizedSha256(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

export function describeFontPreviewFidelity({
  profile,
  loadedEmbeddedProgramSha256,
  verifiedEquivalent,
}: {
  profile: PreviewProfile | null;
  loadedEmbeddedProgramSha256: string | null;
  verifiedEquivalent?: VerifiedEquivalentFontPreview | null;
}): FontPreviewFidelity {
  const expectedEmbeddedSha = normalizedSha256(profile?.embeddedProgramSha256);
  const loadedEmbeddedSha = normalizedSha256(loadedEmbeddedProgramSha256);

  if (
    profile?.isEmbedded &&
    profile.browserPreviewPossible &&
    expectedEmbeddedSha &&
    loadedEmbeddedSha === expectedEmbeddedSha
  ) {
    return {
      kind: "exact-embedded",
      label: "Preview: Exact embedded font",
      detail:
        "The editor is displaying the font program embedded in this PDF. Preview fidelity is informational only; PDF edit safety is still decided by source, glyph, geometry and writer validation.",
      family: profile.familyName,
    };
  }

  if (profile && verifiedEquivalent) {
    return {
      kind: "verified-equivalent",
      label: "Preview: Verified equivalent",
      detail:
        "The editor is displaying a separately verified browser font equivalent for this PDF font. That preview proof does not authorize a PDF rewrite; edit safety is evaluated independently.",
      family: verifiedEquivalent.family,
    };
  }

  return {
    kind: "fallback",
    label: "Preview: Fallback font",
    detail:
      "The browser is displaying a fallback font for this editor preview because the original PDF font is not available as an exact browser face. Native edit safety is evaluated separately and is not weakened or strengthened by this preview.",
    family: profile?.cssFallbackFamily ?? null,
  };
}
