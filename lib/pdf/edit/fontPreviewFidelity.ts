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
  "isEmbedded" | "browserPreviewPossible" | "cssFallbackFamily" | "familyName"
>;

export function describeFontPreviewFidelity({
  profile,
  exactEmbeddedLoaded,
  verifiedEquivalent,
}: {
  profile: PreviewProfile | null;
  exactEmbeddedLoaded: boolean;
  verifiedEquivalent?: VerifiedEquivalentFontPreview | null;
}): FontPreviewFidelity {
  if (
    exactEmbeddedLoaded &&
    profile?.isEmbedded &&
    profile.browserPreviewPossible
  ) {
    return {
      kind: "exact-embedded",
      label: "Preview: Exact embedded font",
      detail:
        "The editor is displaying the font program embedded in this PDF. Preview fidelity is informational only; PDF edit safety is still decided by source, glyph, geometry and writer validation.",
      family: profile.familyName,
    };
  }

  if (verifiedEquivalent) {
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
