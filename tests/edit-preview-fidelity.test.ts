import assert from "node:assert/strict";
import test from "node:test";
import { describeFontPreviewFidelity } from "../lib/pdf/edit/previewFidelity.ts";

const EMBEDDED_SHA = "a".repeat(64);

test("font preview fidelity reports exact only for the loaded embedded program fingerprint", () => {
  const exact = describeFontPreviewFidelity({
    profile: {
      isEmbedded: true,
      embeddedProgramSha256: EMBEDDED_SHA,
    },
    loadedEmbeddedProgramSha256: EMBEDDED_SHA.toUpperCase(),
    verifiedEquivalent: null,
  });

  assert.equal(exact.kind, "exact-embedded");
  assert.equal(exact.label, "Preview: Exact embedded font");
  assert.match(exact.detail, /same embedded font program/i);
  assert.match(exact.detail, /visual only/i);
  assert.match(exact.detail, /never authorizes or blocks/i);
});

test("font preview fidelity fails closed to fallback when the loaded fingerprint does not match", () => {
  const fallback = describeFontPreviewFidelity({
    profile: {
      isEmbedded: true,
      embeddedProgramSha256: EMBEDDED_SHA,
    },
    loadedEmbeddedProgramSha256: "b".repeat(64),
    verifiedEquivalent: null,
  });

  assert.equal(fallback.kind, "fallback");
  assert.equal(fallback.label, "Preview: Fallback font");
  assert.match(fallback.detail, /substitute font/i);
});

test("font preview fidelity exposes verified equivalent only with explicit identity and metric proof", () => {
  const equivalent = describeFontPreviewFidelity({
    profile: {
      isEmbedded: false,
      embeddedProgramSha256: null,
    },
    loadedEmbeddedProgramSha256: null,
    verifiedEquivalent: {
      familyName: "Verified Browser Sans",
      fontIdentityVerified: true,
      glyphMetricsVerified: true,
    },
  });

  assert.equal(equivalent.kind, "verified-equivalent");
  assert.equal(equivalent.label, "Preview: Verified equivalent");
  assert.match(equivalent.detail, /Verified Browser Sans/);
  assert.match(equivalent.detail, /font identity and glyph metrics/i);
});

test("standard or unavailable browser font previews remain honest fallback without equivalence proof", () => {
  const fallback = describeFontPreviewFidelity({
    profile: {
      isEmbedded: false,
      embeddedProgramSha256: null,
    },
    loadedEmbeddedProgramSha256: null,
    verifiedEquivalent: null,
  });

  assert.equal(fallback.kind, "fallback");
  assert.match(fallback.detail, /appearance may differ slightly/i);
});

test("verified-equivalent claims fail closed when no PDF font profile exists", () => {
  const fallback = describeFontPreviewFidelity({
    profile: null,
    loadedEmbeddedProgramSha256: null,
    verifiedEquivalent: {
      familyName: "Unbound Browser Font",
      fontIdentityVerified: true,
      glyphMetricsVerified: true,
    },
  });

  assert.equal(fallback.kind, "fallback");
});

