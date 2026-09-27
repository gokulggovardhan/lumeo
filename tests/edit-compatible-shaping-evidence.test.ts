import assert from "node:assert/strict";
import test from "node:test";
import type { PdfEmbeddedFontTextShaper } from "../lib/pdf/edit/fontRegistry.ts";
import type { ShapedRun } from "../lib/pdf/edit/harfbuzzShaping.ts";
import type { ShapingReconciliation } from "../lib/pdf/edit/shapingReconciliation.ts";
import {
  explicitDirectionForShapingRequirement,
  resolveCompatibleShapingWriteEvidence,
  shapingEvidenceRequestKey,
} from "../lib/pdf/edit/compatibleShapingEvidence.ts";
import { detectComplexShapingRequirement } from "../lib/pdf/edit/shapingWriteGuard.ts";

const noopShaper = (async () => {
  throw new Error("test inspector should not invoke the injected shaper");
}) as PdfEmbeddedFontTextShaper;

function shaped(text: string): ShapedRun {
  return {
    text,
    glyphs: [{
      glyphId: 3,
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
    }],
    clusterMap: [{ startUtf16: 0, endUtf16: text.length, text, glyphIndices: [0] }],
    unitsPerEm: 1000,
    totalAdvance: 600,
    totalAdvanceEm: 0.6,
    totalXAdvance: 600,
    totalYAdvance: 0,
    requestedDirection: "ltr",
    directionWasExplicit: true,
    engine: "harfbuzz",
    engineVersion: "14.5.0",
  };
}

function compatible(text: string): {
  kind: "reconciled";
  shaped: ShapedRun;
  reconciliation: ShapingReconciliation;
} {
  return {
    kind: "reconciled",
    shaped: shaped(text),
    reconciliation: {
      kind: "compatible-character-codes",
      advisoryOnly: true,
      reason: "compatible",
      advanceAgreement: "matched",
      harfBuzzAdvanceEm: 0.6,
      pdfAdvanceEm: 0.6,
      advanceDeltaEm: 0,
      requiresPerGlyphPositioning: false,
      requiresGlyphSubstitution: false,
    },
  };
}

test("ordinary text does not invoke the shaping inspector", async () => {
  let calls = 0;
  const result = await resolveCompatibleShapingWriteEvidence({
    replacementText: "Invoice 2026",
    embeddedProgramSha256: null,
    inspect: async () => {
      calls += 1;
      throw new Error("must not run");
    },
    shapeText: noopShaper,
  });
  assert.equal(result.kind, "not-required");
  assert.equal(calls, 0);
});

test("shaping direction is explicit and conservative", () => {
  const arabic = detectComplexShapingRequirement("سلام");
  const thai = detectComplexShapingRequirement("ก");
  assert.equal(arabic.required, true);
  assert.equal(thai.required, true);
  if (!arabic.required || !thai.required) return;
  assert.equal(explicitDirectionForShapingRequirement(arabic), "rtl");
  assert.equal(explicitDirectionForShapingRequirement(thai), "ltr");
});

test("compatible local shaping mints the exact writer proof", async () => {
  let direction: string | null = null;
  const fingerprint = "a".repeat(64);
  const result = await resolveCompatibleShapingWriteEvidence({
    replacementText: "ก",
    embeddedProgramSha256: fingerprint,
    inspect: async (options) => {
      direction = options.direction;
      return compatible("ก");
    },
    shapeText: noopShaper,
  });
  assert.equal(direction, "ltr");
  assert.equal(result.kind, "validated");
  if (result.kind !== "validated") return;
  assert.equal(result.evidence.replacementText, "ก");
  assert.equal(result.evidence.embeddedProgramSha256, fingerprint);
});

test("true shaped-glyph requirements remain blocked", async () => {
  const result = await resolveCompatibleShapingWriteEvidence({
    replacementText: "سلام",
    embeddedProgramSha256: "b".repeat(64),
    inspect: async (options) => ({
      kind: "reconciled",
      shaped: { ...shaped("سلام"), requestedDirection: options.direction },
      reconciliation: {
        kind: "requires-shaped-glyph-write",
        advisoryOnly: true,
        reason: "RTL ordering needs the shaped-glyph writer.",
        advanceAgreement: "unavailable",
        harfBuzzAdvanceEm: null,
        pdfAdvanceEm: null,
        advanceDeltaEm: null,
        requiresPerGlyphPositioning: true,
        requiresGlyphSubstitution: true,
      },
    }),
    shapeText: noopShaper,
  });
  assert.equal(result.kind, "blocked");
  if (result.kind !== "blocked") return;
  assert.equal(result.direction, "rtl");
  assert.match(result.reason, /shaped-glyph writer/i);
});

test("request keys bind selection, text, resource and embedded fingerprint", () => {
  const base = {
    pageIndex: 0,
    selectionKey: "1,2",
    resourceName: "F1",
    embeddedProgramSha256: "a".repeat(64),
    replacementText: "ก",
  };
  const key = shapingEvidenceRequestKey(base);
  assert.notEqual(key, shapingEvidenceRequestKey({ ...base, replacementText: "ข" }));
  assert.notEqual(key, shapingEvidenceRequestKey({ ...base, selectionKey: "2,3" }));
  assert.notEqual(key, shapingEvidenceRequestKey({ ...base, resourceName: "F2" }));
  assert.notEqual(
    key,
    shapingEvidenceRequestKey({ ...base, embeddedProgramSha256: "b".repeat(64) }),
  );
});
