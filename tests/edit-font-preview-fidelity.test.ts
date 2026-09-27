import assert from "node:assert/strict";
import test from "node:test";
import { describeFontPreviewFidelity } from "../lib/pdf/edit/fontPreviewFidelity.ts";

const embeddedProfile = {
  isEmbedded: true,
  browserPreviewPossible: true,
  cssFallbackFamily: "Arial, Helvetica, sans-serif",
  familyName: "Demo Sans",
};

test("font preview fidelity reports an exact embedded face only after that embedded program loaded", () => {
  const exact = describeFontPreviewFidelity({
    profile: embeddedProfile,
    exactEmbeddedLoaded: true,
  });

  assert.equal(exact.kind, "exact-embedded");
  assert.equal(exact.family, "Demo Sans");
  assert.match(exact.label, /Exact embedded font/i);
  assert.match(exact.detail, /informational only/i);
  assert.match(exact.detail, /edit safety/i);
});

test("font preview fidelity supports independently verified equivalents without making them write authority", () => {
  const equivalent = describeFontPreviewFidelity({
    profile: {
      ...embeddedProfile,
      isEmbedded: false,
      browserPreviewPossible: false,
    },
    exactEmbeddedLoaded: false,
    verifiedEquivalent: {
      family: "Verified Sans Substitute",
      evidence: "independent metric and visual equivalence proof",
    },
  });

  assert.equal(equivalent.kind, "verified-equivalent");
  assert.equal(equivalent.family, "Verified Sans Substitute");
  assert.match(equivalent.label, /Verified equivalent/i);
  assert.match(equivalent.detail, /does not authorize/i);
});

test("font preview fidelity stays fallback when an embedded browser face has not actually loaded", () => {
  const fallback = describeFontPreviewFidelity({
    profile: embeddedProfile,
    exactEmbeddedLoaded: false,
  });

  assert.equal(fallback.kind, "fallback");
  assert.equal(fallback.family, "Arial, Helvetica, sans-serif");
  assert.match(fallback.label, /Fallback font/i);
  assert.match(fallback.detail, /evaluated separately/i);
});

test("font preview fidelity never calls a generic Standard-14 CSS stack verified-equivalent without proof", () => {
  const standardFont = describeFontPreviewFidelity({
    profile: {
      isEmbedded: false,
      browserPreviewPossible: false,
      cssFallbackFamily: "Arial, Helvetica, sans-serif",
      familyName: "Helvetica",
    },
    exactEmbeddedLoaded: false,
  });

  assert.equal(standardFont.kind, "fallback");
  assert.doesNotMatch(standardFont.label, /verified/i);
});
