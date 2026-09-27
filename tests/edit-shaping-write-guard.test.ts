import assert from "node:assert/strict";
import test from "node:test";
import type { ShapedRun } from "../lib/pdf/edit/harfbuzzShaping.ts";
import type { ShapingReconciliation } from "../lib/pdf/edit/shapingReconciliation.ts";
import {
  detectComplexShapingRequirement,
  isValidatedShapingWriteEvidence,
  shapingEvidenceMatchesReplacement,
  validateShapingEvidenceForCharacterCodeWriter,
} from "../lib/pdf/edit/shapingWriteGuard.ts";

function shaped(text: string, direction: "ltr" | "rtl" | "auto" = "ltr"): ShapedRun {
  const codePoint = text.codePointAt(0) ?? 1;
  return {
    text,
    glyphs: text
      ? [
          {
            glyphId: codePoint,
            clusterUtf16: 0,
            flags: 0,
            xAdvance: 600,
            yAdvance: 0,
            xOffset: 0,
            yOffset: 0,
            xAdvanceEm: 0.6,
            yAdvanceEm: 0,
            xOffsetEm: 0,
            yOffsetEm: 0,
          },
        ]
      : [],
    clusterMap: text
      ? [{ startUtf16: 0, endUtf16: text.length, text, glyphIndices: [0] }]
      : [],
    unitsPerEm: 1000,
    totalAdvance: direction === "auto" ? null : 600,
    totalAdvanceEm: direction === "auto" ? null : 0.6,
    totalXAdvance: 600,
    totalYAdvance: 0,
    requestedDirection: direction,
    directionWasExplicit: direction !== "auto",
    engine: "harfbuzz",
    engineVersion: "14.5.0",
  };
}

function compatible(): ShapingReconciliation {
  return {
    kind: "compatible-character-codes",
    advisoryOnly: true,
    reason: "compatible",
    advanceAgreement: "matched",
    harfBuzzAdvanceEm: 0.6,
    pdfAdvanceEm: 0.6,
    advanceDeltaEm: 0,
    requiresPerGlyphPositioning: false,
    requiresGlyphSubstitution: false,
  };
}

test("complex shaping detector keeps ordinary Latin/CJK on the established fast path", () => {
  assert.equal(detectComplexShapingRequirement("Invoice 2026").required, false);
  assert.equal(detectComplexShapingRequirement("東京").required, false);
  assert.equal(detectComplexShapingRequirement("").required, false);
});

test("complex shaping detector recognizes joining, Indic, combining, bidi and variation cases", () => {
  assert.equal(detectComplexShapingRequirement("سلام").required, true);
  assert.equal(detectComplexShapingRequirement("नमस्ते").required, true);
  assert.equal(detectComplexShapingRequirement("e\u0301").required, true);
  assert.equal(detectComplexShapingRequirement("a\u200Db").required, true);
  assert.equal(detectComplexShapingRequirement("\u202Babc").required, true);
  assert.equal(detectComplexShapingRequirement("x\uFE0F").required, true);
});

test("validated shaping proof binds the exact text and SHA-256 fingerprint", () => {
  const fingerprint = "a".repeat(64);
  const result = validateShapingEvidenceForCharacterCodeWriter({
    replacementText: "ก",
    embeddedProgramSha256: fingerprint,
    shaped: shaped("ก"),
    reconciliation: compatible(),
  });

  assert.equal(result.kind, "validated");
  if (result.kind !== "validated") return;
  assert.equal(isValidatedShapingWriteEvidence(result.evidence), true);
  assert.equal(
    shapingEvidenceMatchesReplacement({
      evidence: result.evidence,
      replacementText: "ก",
      embeddedProgramSha256: fingerprint.toUpperCase(),
    }),
    true,
  );
  assert.equal(
    shapingEvidenceMatchesReplacement({
      evidence: result.evidence,
      replacementText: "ข",
      embeddedProgramSha256: fingerprint,
    }),
    false,
  );
  assert.equal(
    shapingEvidenceMatchesReplacement({
      evidence: result.evidence,
      replacementText: "ก",
      embeddedProgramSha256: "b".repeat(64),
    }),
    false,
  );
});

test("shaping proof issuance fails closed for mismatched text, auto direction and shaped-writer requirements", () => {
  const fingerprint = "a".repeat(64);

  const mismatched = validateShapingEvidenceForCharacterCodeWriter({
    replacementText: "ก",
    embeddedProgramSha256: fingerprint,
    shaped: shaped("ข"),
    reconciliation: compatible(),
  });
  assert.equal(mismatched.kind, "blocked");

  const automatic = validateShapingEvidenceForCharacterCodeWriter({
    replacementText: "ก",
    embeddedProgramSha256: fingerprint,
    shaped: shaped("ก", "auto"),
    reconciliation: compatible(),
  });
  assert.equal(automatic.kind, "blocked");

  const shapedWriter = validateShapingEvidenceForCharacterCodeWriter({
    replacementText: "ก",
    embeddedProgramSha256: fingerprint,
    shaped: shaped("ก"),
    reconciliation: {
      ...compatible(),
      kind: "requires-shaped-glyph-write",
      reason: "needs positioning",
      requiresPerGlyphPositioning: true,
    },
  });
  assert.equal(shapedWriter.kind, "blocked");
});

test("shaping proof requires a real SHA-256 shaped-font fingerprint", () => {
  const result = validateShapingEvidenceForCharacterCodeWriter({
    replacementText: "ก",
    embeddedProgramSha256: "not-a-sha",
    shaped: shaped("ก"),
    reconciliation: compatible(),
  });
  assert.equal(result.kind, "blocked");
});
