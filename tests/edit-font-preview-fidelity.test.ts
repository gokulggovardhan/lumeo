import assert from "node:assert/strict";
import test from "node:test";
import { describeFontPreviewFidelity } from "../lib/pdf/edit/fontPreviewFidelity.ts";

const EMBEDDED_SHA = "a".repeat(64);
const embeddedProfile = {
  isEmbedded: true,
  browserPreviewPossible: true,
  cssFallbackFamily: "Arial, Helvetica, sans-serif",
  familyName: "Demo Sans",
  embeddedProgramSha256: EMBEDDED_SHA,
};

test("font preview fidelity reports exact only for the loaded embedded program fingerprint", () => {
  const exact = describeFontPreviewFidelity({
    profile: embeddedProfile,
    loadedEmbeddedProgramSha256: EMBEDDED_SHA.toUpperCase(),
  });

  assert.equal(exact.kind, "exact-embedded");
  assert.equal(exact.family, "Demo Sans");
  assert.match(exact.label, /Exact embedded font/i);
  assert.match(exact.detail, /same embedded font program/i);
  assert.match(exact.detail, /informational only/i);
});

test("font preview fidelity fails closed when a loaded embedded face has a different fingerprint", () => {
  const fallback = describeFontPreviewFidelity({
    profile: embeddedProfile,
    loadedEmbeddedProgramSha256: "b".repeat(64),
  });

  assert.equal(fallback.kind, "fallback");
  assert.equal(fallback.family, "Arial, Helvetica, sans-serif");
  assert.match(fallback.detail, /fingerprint-matched/i);
});

test("font preview fidelity fails closed when fingerprint evidence is missing or malformed", () => {
  for (const loadedEmbeddedProgramSha256 of [null, "not-a-sha"]) {
    const fallback = describeFontPreviewFidelity({
      profile: embeddedProfile,
      loadedEmbeddedProgramSha256,
    });
    assert.equal(fallback.kind, "fallback");
  }

  const missingRegistryFingerprint = describeFontPreviewFidelity({
    profile: {
      ...embeddedProfile,
      embeddedProgramSha256: null,
    },
    loadedEmbeddedProgramSha256: EMBEDDED_SHA,
  });
  assert.equal(missingRegistryFingerprint.kind, "fallback");
});

test("font preview fidelity supports independently verified equivalents without making them write authority", () => {
  const equivalent = describeFontPreviewFidelity({
    profile: {
      ...embeddedProfile,
      isEmbedded: false,
      browserPreviewPossible: false,
      embeddedProgramSha256: null,
    },
    loadedEmbeddedProgramSha256: null,
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

test("font preview fidelity never calls a generic Standard-14 CSS stack verified-equivalent without proof", () => {
  const standardFont = describeFontPreviewFidelity({
    profile: {
      isEmbedded: false,
      browserPreviewPossible: false,
      cssFallbackFamily: "Arial, Helvetica, sans-serif",
      familyName: "Helvetica",
      embeddedProgramSha256: null,
    },
    loadedEmbeddedProgramSha256: null,
  });

  assert.equal(standardFont.kind, "fallback");
  assert.doesNotMatch(standardFont.label, /verified/i);
});
